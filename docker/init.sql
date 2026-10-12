-- Runs once when the local Postgres volume is first created.
CREATE EXTENSION IF NOT EXISTS citext;
CREATE DATABASE elation_test;
\connect elation_test
CREATE EXTENSION IF NOT EXISTS citext;
