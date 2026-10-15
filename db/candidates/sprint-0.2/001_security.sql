-- QUARANTINED: forward-only, fresh disposable baseline; never auto-apply.
-- Required pre-provisioned distinct roles: hv_schema (NOLOGIN), hv_operation
-- (NOLOGIN), hv_runtime (LOGIN), hv_migrator (LOGIN, member of hv_schema).
-- hv_schema must be a member of hv_operation for function ownership assignment.
-- hv_runtime must have no role memberships, no database/schema CREATE, and no
-- inherited/PUBLIC grants elsewhere (separate administrator-reviewed preflight).
-- Apply only as controlled migrator after explicit target authorization.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
DO $$ BEGIN
 IF current_user <> 'hv_migrator' OR EXISTS (SELECT 1 FROM pg_roles WHERE rolname IN ('hv_schema','hv_operation','hv_runtime') AND (rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb OR rolreplication))
 OR (SELECT count(*) FROM pg_roles WHERE rolname IN ('hv_schema','hv_operation','hv_runtime','hv_migrator')) <> 4
 OR EXISTS (SELECT 1 FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.member WHERE r.rolname IN ('hv_runtime','hv_operation'))
 OR EXISTS (SELECT 1 FROM pg_roles WHERE rolname IN ('hv_schema','hv_operation') AND rolcanlogin)
 THEN RAISE EXCEPTION 'BLOCKED: unsafe or unavailable role boundaries'; END IF;
 IF has_database_privilege('hv_runtime',current_database(),'CREATE') OR has_schema_privilege('hv_runtime','public','CREATE') THEN RAISE EXCEPTION 'BLOCKED: runtime inherits CREATE'; END IF;
END $$;
SET LOCAL ROLE hv_schema;
CREATE SCHEMA hv AUTHORIZATION hv_schema;
REVOKE ALL ON SCHEMA hv FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA hv REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
CREATE TABLE hv.users (id uuid PRIMARY KEY, auth_epoch bigint NOT NULL DEFAULT 1 CHECK(auth_epoch>0));
CREATE TABLE hv.organizations (id uuid PRIMARY KEY, owner_user_id uuid NOT NULL REFERENCES hv.users(id) ON DELETE RESTRICT, name text NOT NULL CHECK(length(name) BETWEEN 1 AND 200), timezone text NOT NULL, version integer NOT NULL DEFAULT 1 CHECK(version>0));
CREATE TABLE hv.memberships (id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES hv.organizations(id) ON DELETE RESTRICT, user_id uuid NOT NULL REFERENCES hv.users(id) ON DELETE RESTRICT, role text NOT NULL CHECK(role IN ('OWNER','ADMIN','MANAGER','EMPLOYEE','CONTRACTOR')), active boolean NOT NULL DEFAULT true, version integer NOT NULL DEFAULT 1 CHECK(version>0), UNIQUE(organization_id,user_id), UNIQUE(organization_id,id));
ALTER TABLE hv.organizations ADD CONSTRAINT owner_membership FOREIGN KEY(id,owner_user_id) REFERENCES hv.memberships(organization_id,user_id) DEFERRABLE INITIALLY DEFERRED;
CREATE UNIQUE INDEX one_active_owner ON hv.memberships(organization_id) WHERE active AND role='OWNER';
CREATE TABLE hv.monitoring_policies (organization_id uuid PRIMARY KEY REFERENCES hv.organizations(id) ON DELETE RESTRICT, idle_detection boolean NOT NULL DEFAULT false CHECK(NOT idle_detection), applications boolean NOT NULL DEFAULT false CHECK(NOT applications), websites boolean NOT NULL DEFAULT false CHECK(NOT websites), screenshots boolean NOT NULL DEFAULT false CHECK(NOT screenshots), productivity boolean NOT NULL DEFAULT false CHECK(NOT productivity));
CREATE TABLE hv.audit_events (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, organization_id uuid NOT NULL REFERENCES hv.organizations(id) ON DELETE RESTRICT, actor_id uuid NOT NULL REFERENCES hv.users(id) ON DELETE RESTRICT, correlation_id uuid NOT NULL, transaction_id bigint NOT NULL, action text NOT NULL, target_id uuid NOT NULL, occurred_at timestamptz NOT NULL DEFAULT clock_timestamp());
-- No TTL deletion: key reuse never reexecutes a committed creation.
CREATE TABLE hv.bootstrap_requests (actor_id uuid NOT NULL REFERENCES hv.users(id), key text NOT NULL CHECK(length(key) BETWEEN 1 AND 200), payload_hash text NOT NULL CHECK(payload_hash ~ '^[a-f0-9]{64}$'), organization_id uuid NOT NULL REFERENCES hv.organizations(id) DEFERRABLE INITIALLY DEFERRED, PRIMARY KEY(actor_id,key));
CREATE TABLE hv.operation_requests (organization_id uuid NOT NULL REFERENCES hv.organizations(id), actor_id uuid NOT NULL REFERENCES hv.users(id), operation text NOT NULL CHECK(operation='revoke'), key text NOT NULL CHECK(length(key) BETWEEN 1 AND 200), payload_hash text NOT NULL CHECK(payload_hash ~ '^[a-f0-9]{64}$'), target_id uuid NOT NULL, FOREIGN KEY(organization_id,target_id) REFERENCES hv.memberships(organization_id,id), PRIMARY KEY(organization_id,actor_id,operation,key));
CREATE FUNCTION hv.context(name text) RETURNS uuid LANGUAGE sql STABLE SET search_path=pg_catalog AS $$ SELECT nullif(current_setting('hv.' || name,true),'')::uuid $$;
CREATE FUNCTION hv.immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN RAISE EXCEPTION 'immutable record' USING ERRCODE='42501'; END $$;
CREATE TRIGGER immutable_audit BEFORE UPDATE OR DELETE OR TRUNCATE ON hv.audit_events FOR EACH STATEMENT EXECUTE FUNCTION hv.immutable();
CREATE TRIGGER immutable_requests BEFORE UPDATE OR DELETE OR TRUNCATE ON hv.bootstrap_requests FOR EACH STATEMENT EXECUTE FUNCTION hv.immutable();
CREATE TRIGGER immutable_operation_requests BEFORE UPDATE OR DELETE OR TRUNCATE ON hv.operation_requests FOR EACH STATEMENT EXECUTE FUNCTION hv.immutable();
CREATE TRIGGER no_org_delete BEFORE DELETE OR TRUNCATE ON hv.organizations FOR EACH STATEMENT EXECUTE FUNCTION hv.immutable();
CREATE FUNCTION hv.identity_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN
 IF TG_TABLE_NAME='organizations' THEN
  IF NEW.id<>OLD.id OR NEW.owner_user_id<>OLD.owner_user_id THEN RAISE EXCEPTION 'owner transfer unavailable' USING ERRCODE='42501'; END IF;
 ELSE
  IF NEW.id<>OLD.id OR NEW.organization_id<>OLD.organization_id OR NEW.user_id<>OLD.user_id OR OLD.role='OWNER' OR NEW.role='OWNER' OR NOT OLD.active OR NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'protected membership lifecycle' USING ERRCODE='42501'; END IF;
 END IF; RETURN NEW;
END $$;
CREATE TRIGGER org_identity BEFORE UPDATE ON hv.organizations FOR EACH ROW EXECUTE FUNCTION hv.identity_guard();
CREATE TRIGGER member_identity BEFORE UPDATE ON hv.memberships FOR EACH ROW EXECUTE FUNCTION hv.identity_guard();
CREATE TRIGGER no_member_delete BEFORE DELETE OR TRUNCATE ON hv.memberships FOR EACH STATEMENT EXECUTE FUNCTION hv.immutable();
CREATE FUNCTION hv.owner_check() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ DECLARE oid uuid; BEGIN
 oid := CASE WHEN TG_TABLE_NAME='organizations' THEN NEW.id ELSE NEW.organization_id END;
 IF NOT EXISTS(SELECT 1 FROM hv.organizations o JOIN hv.memberships m ON m.organization_id=o.id AND m.user_id=o.owner_user_id WHERE o.id=oid AND m.active AND m.role='OWNER') THEN RAISE EXCEPTION 'missing matching active owner' USING ERRCODE='23514'; END IF; RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER owner_org AFTER INSERT OR UPDATE ON hv.organizations DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION hv.owner_check();
CREATE CONSTRAINT TRIGGER owner_member AFTER INSERT OR UPDATE ON hv.memberships DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION hv.owner_check();
CREATE FUNCTION hv.audit_mutation() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ DECLARE oid uuid; tid uuid; BEGIN
 oid := CASE WHEN TG_TABLE_NAME='organizations' THEN NEW.id ELSE NEW.organization_id END;
 tid := CASE WHEN TG_TABLE_NAME='monitoring_policies' THEN NEW.organization_id ELSE NEW.id END;
 IF hv.context('actor') IS NULL OR hv.context('correlation') IS NULL OR hv.context('organization') IS DISTINCT FROM oid THEN RAISE EXCEPTION 'missing audit context' USING ERRCODE='42501'; END IF;
 INSERT INTO hv.audit_events(organization_id,actor_id,correlation_id,transaction_id,action,target_id) VALUES(oid,hv.context('actor'),hv.context('correlation'),txid_current(),TG_TABLE_NAME || ':' || TG_OP,tid); RETURN NEW;
END $$;
CREATE TRIGGER audit_org AFTER INSERT OR UPDATE ON hv.organizations FOR EACH ROW EXECUTE FUNCTION hv.audit_mutation();
CREATE TRIGGER audit_member AFTER INSERT OR UPDATE ON hv.memberships FOR EACH ROW EXECUTE FUNCTION hv.audit_mutation();
CREATE TRIGGER audit_monitoring AFTER INSERT OR UPDATE ON hv.monitoring_policies FOR EACH ROW EXECUTE FUNCTION hv.audit_mutation();
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['users','organizations','memberships','monitoring_policies','audit_events','bootstrap_requests','operation_requests'] LOOP
 EXECUTE format('ALTER TABLE hv.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('ALTER TABLE hv.%I FORCE ROW LEVEL SECURITY',t);
 EXECUTE format('CREATE POLICY integrity ON hv.%I TO hv_schema USING (true) WITH CHECK (true)',t);
 END LOOP;
END $$;
CREATE POLICY actor_user ON hv.users TO hv_operation USING(id=hv.context('actor'));
CREATE POLICY tenant_org ON hv.organizations TO hv_operation USING(id=hv.context('organization')) WITH CHECK(id=hv.context('organization') AND owner_user_id=hv.context('actor'));
CREATE POLICY tenant_members ON hv.memberships TO hv_operation USING(organization_id=hv.context('organization')) WITH CHECK(organization_id=hv.context('organization'));
CREATE POLICY tenant_monitoring ON hv.monitoring_policies TO hv_operation USING(organization_id=hv.context('organization')) WITH CHECK(organization_id=hv.context('organization'));
CREATE POLICY tenant_audit ON hv.audit_events TO hv_operation USING(organization_id=hv.context('organization'));
CREATE POLICY actor_requests ON hv.bootstrap_requests TO hv_operation USING(actor_id=hv.context('actor')) WITH CHECK(actor_id=hv.context('actor'));
CREATE POLICY tenant_requests ON hv.operation_requests TO hv_operation USING(organization_id=hv.context('organization') AND actor_id=hv.context('actor')) WITH CHECK(organization_id=hv.context('organization') AND actor_id=hv.context('actor'));
GRANT USAGE ON SCHEMA hv TO hv_operation,hv_runtime;
GRANT SELECT ON ALL TABLES IN SCHEMA hv TO hv_operation;
GRANT INSERT ON hv.organizations,hv.memberships,hv.monitoring_policies,hv.bootstrap_requests,hv.operation_requests TO hv_operation;
GRANT UPDATE(active,version) ON hv.memberships TO hv_operation;
GRANT UPDATE(auth_epoch) ON hv.users TO hv_operation;
GRANT UPDATE(version) ON hv.organizations TO hv_operation;
GRANT EXECUTE ON FUNCTION hv.context(text) TO hv_operation;
-- Owner grants function ownership temporarily; revoked below.
GRANT CREATE ON SCHEMA hv TO hv_operation;
CREATE FUNCTION hv.provision(org uuid, member uuid, name text, timezone text, request_key text, digest text, epoch bigint) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ DECLARE existing_request hv.bootstrap_requests; BEGIN
 IF hv.context('actor') IS NULL OR hv.context('organization') IS DISTINCT FROM org OR hv.context('correlation') IS NULL THEN RAISE EXCEPTION 'context denied' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM hv.users WHERE id=hv.context('actor') AND auth_epoch=epoch FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'session epoch denied' USING ERRCODE='42501'; END IF;
 -- Global user lock serializes bootstrap keys and global revocation.
 SELECT * INTO existing_request FROM hv.bootstrap_requests WHERE actor_id=hv.context('actor') AND key=request_key;
 IF FOUND THEN
  IF existing_request.payload_hash<>digest THEN RAISE EXCEPTION 'idempotency conflict' USING ERRCODE='22000'; END IF;
  PERFORM set_config('hv.organization',existing_request.organization_id::text,true);
  PERFORM 1 FROM hv.memberships WHERE organization_id=existing_request.organization_id AND user_id=hv.context('actor') AND active AND role='OWNER';
  IF NOT FOUND THEN RAISE EXCEPTION 'replay authority denied' USING ERRCODE='42501'; END IF;
  RETURN existing_request.organization_id;
 END IF;
 INSERT INTO hv.organizations VALUES(org,hv.context('actor'),name,timezone,1);
 INSERT INTO hv.memberships VALUES(member,org,hv.context('actor'),'OWNER',true,1);
 INSERT INTO hv.monitoring_policies(organization_id) VALUES(org);
 INSERT INTO hv.bootstrap_requests VALUES(hv.context('actor'),request_key,digest,org);
 RETURN org;
END $$;
CREATE FUNCTION hv.revoke_member(target uuid, epoch bigint, request_key text, digest text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ DECLARE previous hv.operation_requests; BEGIN
 PERFORM 1 FROM hv.users WHERE id=hv.context('actor') AND auth_epoch=epoch FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'session denied' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM hv.organizations WHERE id=hv.context('organization') FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'organization denied' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM hv.memberships WHERE organization_id=hv.context('organization') AND user_id=hv.context('actor') AND active AND role='OWNER' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'permission denied' USING ERRCODE='42501'; END IF;
 SELECT * INTO previous FROM hv.operation_requests WHERE organization_id=hv.context('organization') AND actor_id=hv.context('actor') AND operation='revoke' AND key=request_key;
 IF FOUND THEN
  IF previous.payload_hash<>digest OR previous.target_id<>target THEN RAISE EXCEPTION 'idempotency conflict' USING ERRCODE='22000'; END IF;
  RETURN;
 END IF;
 UPDATE hv.memberships SET active=false,version=version+1 WHERE id=target AND organization_id=hv.context('organization') AND role<>'OWNER' AND active;
 IF NOT FOUND THEN RAISE EXCEPTION 'target denied' USING ERRCODE='42501'; END IF;
 INSERT INTO hv.operation_requests VALUES(hv.context('organization'),hv.context('actor'),'revoke',request_key,digest,target);
END $$;
CREATE FUNCTION hv.read_organization(epoch bigint) RETURNS TABLE(id uuid,name text) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 PERFORM 1 FROM hv.users WHERE users.id=hv.context('actor') AND auth_epoch=epoch FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'session denied' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM hv.organizations o WHERE o.id=hv.context('organization') FOR UPDATE;
 PERFORM 1 FROM hv.memberships m WHERE m.organization_id=hv.context('organization') AND m.user_id=hv.context('actor') AND m.active;
 IF NOT FOUND THEN RAISE EXCEPTION 'membership denied' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT o.id,o.name FROM hv.organizations o WHERE o.id=hv.context('organization');
END $$;
CREATE FUNCTION hv.lookup_bootstrap(request_key text, digest text, epoch bigint) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ DECLARE previous hv.bootstrap_requests; BEGIN
 PERFORM 1 FROM hv.users WHERE id=hv.context('actor') AND auth_epoch=epoch FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'session denied' USING ERRCODE='42501'; END IF;
 SELECT * INTO previous FROM hv.bootstrap_requests WHERE actor_id=hv.context('actor') AND key=request_key;
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF previous.payload_hash<>digest THEN RAISE EXCEPTION 'idempotency conflict' USING ERRCODE='22000'; END IF;
 PERFORM set_config('hv.organization',previous.organization_id::text,true);
 PERFORM 1 FROM hv.organizations WHERE id=previous.organization_id FOR UPDATE;
 PERFORM 1 FROM hv.memberships WHERE organization_id=previous.organization_id AND user_id=hv.context('actor') AND active AND role='OWNER';
 IF NOT FOUND THEN RAISE EXCEPTION 'replay authority denied' USING ERRCODE='42501'; END IF;
 RETURN previous.organization_id;
END $$;
ALTER FUNCTION hv.lookup_bootstrap(text,text,bigint) OWNER TO hv_operation;
ALTER FUNCTION hv.provision(uuid,uuid,text,text,text,text,bigint) OWNER TO hv_operation;
ALTER FUNCTION hv.revoke_member(uuid,bigint,text,text) OWNER TO hv_operation;
ALTER FUNCTION hv.read_organization(bigint) OWNER TO hv_operation;
REVOKE CREATE ON SCHEMA hv FROM hv_operation;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA hv FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hv.provision(uuid,uuid,text,text,text,text,bigint),hv.revoke_member(uuid,bigint,text,text),hv.read_organization(bigint),hv.lookup_bootstrap(text,text,bigint) TO hv_runtime;
COMMIT;
