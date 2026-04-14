-- Project scan metadata — stored as JSON blob to keep schema flexible
-- Null until the background scanner completes for the first time.

ALTER TABLE projects ADD COLUMN metadata TEXT;
