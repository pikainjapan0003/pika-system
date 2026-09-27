-- Seller Agent is no longer part of this product. Logistics owns its own
-- shipment tracking, events, exceptions and run logs; those tables stay intact.
-- Apply only after the API no longer imports the Agent schema/routes.
DROP TABLE IF EXISTS agent_run_logs;
DROP TABLE IF EXISTS seller_agent_tokens;
DROP TABLE IF EXISTS seller_agent_settings;
