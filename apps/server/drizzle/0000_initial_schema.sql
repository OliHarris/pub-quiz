CREATE TABLE "bank_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category" text NOT NULL,
	"difficulty" text NOT NULL,
	"text" text NOT NULL,
	"text_key" text NOT NULL,
	"options" text[] NOT NULL,
	"correct_index" integer NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bank_questions_text_key_unique" UNIQUE("text_key"),
	CONSTRAINT "bank_questions_options_count" CHECK (cardinality("bank_questions"."options") between 2 and 4),
	CONSTRAINT "bank_questions_correct_index" CHECK ("bank_questions"."correct_index" >= 0 and "bank_questions"."correct_index" < cardinality("bank_questions"."options"))
);
--> statement-breakpoint
CREATE TABLE "game_teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" uuid NOT NULL,
	"name" text NOT NULL,
	"score" integer NOT NULL,
	"rank" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "games" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"host_id" uuid NOT NULL,
	"quiz_id" uuid,
	"quiz_title" text NOT NULL,
	"room_code" text NOT NULL,
	"finished_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hosts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hosts_key_hash_unique" UNIQUE("key_hash")
);
--> statement-breakpoint
CREATE TABLE "quiz_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quiz_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"text" text NOT NULL,
	"options" text[] NOT NULL,
	"correct_index" integer NOT NULL,
	"time_limit_sec" integer NOT NULL,
	CONSTRAINT "quiz_questions_quiz_position_unique" UNIQUE("quiz_id","position"),
	CONSTRAINT "quiz_questions_options_count" CHECK (cardinality("quiz_questions"."options") between 2 and 4),
	CONSTRAINT "quiz_questions_correct_index" CHECK ("quiz_questions"."correct_index" >= 0 and "quiz_questions"."correct_index" < cardinality("quiz_questions"."options"))
);
--> statement-breakpoint
CREATE TABLE "quizzes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"host_id" uuid NOT NULL,
	"title" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "game_teams" ADD CONSTRAINT "game_teams_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_host_id_hosts_id_fk" FOREIGN KEY ("host_id") REFERENCES "public"."hosts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_quiz_id_quizzes_id_fk" FOREIGN KEY ("quiz_id") REFERENCES "public"."quizzes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_questions" ADD CONSTRAINT "quiz_questions_quiz_id_quizzes_id_fk" FOREIGN KEY ("quiz_id") REFERENCES "public"."quizzes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_host_id_hosts_id_fk" FOREIGN KEY ("host_id") REFERENCES "public"."hosts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bank_questions_category_idx" ON "bank_questions" USING btree ("category","difficulty");--> statement-breakpoint
CREATE INDEX "game_teams_game_id_idx" ON "game_teams" USING btree ("game_id");--> statement-breakpoint
CREATE INDEX "games_host_id_idx" ON "games" USING btree ("host_id","finished_at");--> statement-breakpoint
CREATE INDEX "quizzes_host_id_idx" ON "quizzes" USING btree ("host_id");