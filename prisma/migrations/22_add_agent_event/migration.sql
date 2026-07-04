-- RFD 0002: AI/bot traffic capture
-- CreateTable
CREATE TABLE "agent_event" (
    "agent_event_id" UUID NOT NULL,
    "website_id" UUID NOT NULL,
    "category" VARCHAR(20) NOT NULL,
    "name" VARCHAR(50),
    "operator" VARCHAR(50),
    "url_path" VARCHAR(500) NOT NULL,
    "hostname" VARCHAR(100),
    "referrer_domain" VARCHAR(500),
    "user_agent" VARCHAR(500),
    "ip_hash" VARCHAR(64),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_event_pkey" PRIMARY KEY ("agent_event_id")
);

-- CreateIndex
CREATE INDEX "agent_event_website_id_created_at_idx" ON "agent_event"("website_id", "created_at");
CREATE INDEX "agent_event_website_id_created_at_name_idx" ON "agent_event"("website_id", "created_at", "name");
CREATE INDEX "agent_event_website_id_created_at_url_path_idx" ON "agent_event"("website_id", "created_at", "url_path");
