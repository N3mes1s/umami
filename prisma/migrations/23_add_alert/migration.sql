-- RFD 0008: alerts, webhooks & jobs
-- CreateTable
CREATE TABLE "alert" (
    "alert_id" UUID NOT NULL,
    "website_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "type" VARCHAR(50) NOT NULL,
    "parameters" JSONB NOT NULL,
    "channels" JSONB NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "interval_minutes" INTEGER NOT NULL DEFAULT 60,
    "next_run_at" TIMESTAMPTZ(6),
    "last_triggered_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6),
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "alert_pkey" PRIMARY KEY ("alert_id")
);

-- CreateTable
CREATE TABLE "alert_event" (
    "alert_event_id" UUID NOT NULL,
    "alert_id" UUID NOT NULL,
    "website_id" UUID NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "payload" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alert_event_pkey" PRIMARY KEY ("alert_event_id")
);

-- CreateIndex
CREATE INDEX "alert_website_id_idx" ON "alert"("website_id");
CREATE INDEX "alert_enabled_next_run_at_idx" ON "alert"("enabled", "next_run_at");
CREATE INDEX "alert_event_alert_id_created_at_idx" ON "alert_event"("alert_id", "created_at");
CREATE INDEX "alert_event_website_id_created_at_idx" ON "alert_event"("website_id", "created_at");
