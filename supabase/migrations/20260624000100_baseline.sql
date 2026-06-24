


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."default_datasets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "dataset_name" "text" NOT NULL,
    "bucket_name" "text" NOT NULL,
    "object_prefix" "text" NOT NULL,
    "enabled" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."default_datasets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."progress_attempts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "database_name" "text" NOT NULL,
    "query_id" "text" NOT NULL,
    "practice_mode" "text" NOT NULL,
    "expression" "text" NOT NULL,
    "is_correct" boolean,
    "attempted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "progress_attempts_practice_mode_check" CHECK (("practice_mode" = ANY (ARRAY['predefined'::"text", 'operator_based'::"text"])))
);


ALTER TABLE "public"."progress_attempts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."query_attempts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "database_name" "text" NOT NULL,
    "query_id" "text" NOT NULL,
    "is_correct" boolean NOT NULL,
    "attempted_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."query_attempts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."query_mastery" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "database_name" "text" NOT NULL,
    "query_id" "text" NOT NULL,
    "mastered_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."query_mastery" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_datasets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "database_name" "text" NOT NULL,
    "source_type" "text" DEFAULT 'user'::"text" NOT NULL,
    "bucket_name" "text" DEFAULT 'ra-user-datasets'::"text" NOT NULL,
    "object_prefix" "text" DEFAULT ''::"text" NOT NULL,
    "is_default" boolean DEFAULT false NOT NULL,
    "hidden" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "user_datasets_source_type_check" CHECK (("source_type" = ANY (ARRAY['default'::"text", 'user'::"text"])))
);


ALTER TABLE "public"."user_datasets" OWNER TO "postgres";


ALTER TABLE ONLY "public"."default_datasets"
    ADD CONSTRAINT "default_datasets_dataset_name_key" UNIQUE ("dataset_name");



ALTER TABLE ONLY "public"."default_datasets"
    ADD CONSTRAINT "default_datasets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."progress_attempts"
    ADD CONSTRAINT "progress_attempts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."query_attempts"
    ADD CONSTRAINT "query_attempts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."query_mastery"
    ADD CONSTRAINT "query_mastery_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."query_mastery"
    ADD CONSTRAINT "query_mastery_user_id_database_name_query_id_key" UNIQUE ("user_id", "database_name", "query_id");



ALTER TABLE ONLY "public"."user_datasets"
    ADD CONSTRAINT "user_datasets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_datasets"
    ADD CONSTRAINT "user_datasets_user_id_database_name_key" UNIQUE ("user_id", "database_name");



CREATE INDEX "default_datasets_enabled_idx" ON "public"."default_datasets" USING "btree" ("enabled", "dataset_name");



CREATE INDEX "progress_attempts_user_db_idx" ON "public"."progress_attempts" USING "btree" ("user_id", "database_name", "attempted_at" DESC);



CREATE INDEX "query_attempts_user_idx" ON "public"."query_attempts" USING "btree" ("user_id", "database_name", "query_id");



CREATE INDEX "query_mastery_user_idx" ON "public"."query_mastery" USING "btree" ("user_id", "database_name", "query_id");



CREATE INDEX "user_datasets_lookup_idx" ON "public"."user_datasets" USING "btree" ("user_id", "source_type", "hidden");



CREATE INDEX "user_datasets_user_idx" ON "public"."user_datasets" USING "btree" ("user_id", "database_name");



CREATE OR REPLACE TRIGGER "trg_default_datasets_updated_at" BEFORE UPDATE ON "public"."default_datasets" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_query_mastery_updated_at" BEFORE UPDATE ON "public"."query_mastery" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_user_datasets_updated_at" BEFORE UPDATE ON "public"."user_datasets" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



ALTER TABLE ONLY "public"."progress_attempts"
    ADD CONSTRAINT "progress_attempts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."query_attempts"
    ADD CONSTRAINT "query_attempts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."query_mastery"
    ADD CONSTRAINT "query_mastery_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_datasets"
    ADD CONSTRAINT "user_datasets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE "public"."default_datasets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "default_datasets_read_auth" ON "public"."default_datasets" FOR SELECT TO "authenticated" USING (("enabled" = true));



ALTER TABLE "public"."progress_attempts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."query_attempts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "query_attempts_insert_own" ON "public"."query_attempts" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "query_attempts_select_own" ON "public"."query_attempts" FOR SELECT USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."query_mastery" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "query_mastery_delete_own" ON "public"."query_mastery" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "query_mastery_insert_own" ON "public"."query_mastery" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "query_mastery_select_own" ON "public"."query_mastery" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "query_mastery_update_own" ON "public"."query_mastery" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."user_datasets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_datasets_delete_own" ON "public"."user_datasets" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "user_datasets_insert_own" ON "public"."user_datasets" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "user_datasets_select_own" ON "public"."user_datasets" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "user_datasets_update_own" ON "public"."user_datasets" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "anon";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



GRANT ALL ON TABLE "public"."default_datasets" TO "anon";
GRANT ALL ON TABLE "public"."default_datasets" TO "authenticated";
GRANT ALL ON TABLE "public"."default_datasets" TO "service_role";



GRANT ALL ON TABLE "public"."progress_attempts" TO "anon";
GRANT ALL ON TABLE "public"."progress_attempts" TO "authenticated";
GRANT ALL ON TABLE "public"."progress_attempts" TO "service_role";



GRANT ALL ON TABLE "public"."query_attempts" TO "anon";
GRANT ALL ON TABLE "public"."query_attempts" TO "authenticated";
GRANT ALL ON TABLE "public"."query_attempts" TO "service_role";



GRANT ALL ON TABLE "public"."query_mastery" TO "anon";
GRANT ALL ON TABLE "public"."query_mastery" TO "authenticated";
GRANT ALL ON TABLE "public"."query_mastery" TO "service_role";



GRANT ALL ON TABLE "public"."user_datasets" TO "anon";
GRANT ALL ON TABLE "public"."user_datasets" TO "authenticated";
GRANT ALL ON TABLE "public"."user_datasets" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







