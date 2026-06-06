CREATE TABLE IF NOT EXISTS schema_collab.media_access_cache (
  object_key text NOT NULL,
  force_download boolean NOT NULL,
  url text NOT NULL,
  expires_at timestamp NOT NULL,
  created_at timestamp DEFAULT now() NOT NULL,
  updated_at timestamp DEFAULT now() NOT NULL,
  CONSTRAINT media_access_cache_pkey PRIMARY KEY (object_key, force_download)
);

CREATE INDEX IF NOT EXISTS idx_media_access_cache_expires_at
  ON schema_collab.media_access_cache (expires_at);

ALTER TABLE schema_collab.media_access_cache OWNER TO collab_user;
