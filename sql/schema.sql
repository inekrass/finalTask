CREATE TABLE IF NOT EXISTS tasks (
    id UUID PRIMARY KEY,
    owner_login TEXT NOT NULL,
    title VARCHAR(200) NOT NULL CHECK (length(trim(title)) > 0),
    done BOOLEAN NOT NULL DEFAULT FALSE,
    run_id VARCHAR(64) NOT NULL CHECK (run_id ~ '^[A-Za-z0-9_-]+$'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
