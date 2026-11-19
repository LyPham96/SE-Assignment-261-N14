import {definitions, sqlIdentifier} from '../schema.mjs';

export function up(pgm) {
  for (const [table, columns] of Object.values(definitions)) {
    const fields = Object.entries(columns).map(([name,type]) => {
      const sqlType = type === 'time' ? 'timestamptz' : type;
      const constraint = name === 'id' ? table === 'scenario' ? ' NOT NULL' : ' NOT NULL UNIQUE' : '';
      return sqlIdentifier(name) + ' ' + sqlType + constraint;
    });
    pgm.sql('CREATE TABLE ' + sqlIdentifier(table) + '(entity_key text PRIMARY KEY, position integer NOT NULL,' + fields.join(',') + ')');
  }
  pgm.sql(`
    CREATE UNIQUE INDEX active_charging_vehicle ON charging_request ("vehicleId")
      WHERE status IN ('CHO_XEP_LICH','DA_XEP_LICH','DANG_SAC');
    CREATE UNIQUE INDEX active_incident_resource ON incident ("resourceType", "resourceId")
      WHERE status IN ('MOI','DANG_XU_LY');
    CREATE UNIQUE INDEX order_idempotency_key ON rebalancing_order ("idempotencyKey");
    CREATE UNIQUE INDEX active_alert_by_resource ON overload_alert ("hubId",resource) WHERE "closedAt" IS NULL;
    CREATE EXTENSION IF NOT EXISTS btree_gist;
    ALTER TABLE charging_session ALTER COLUMN "start" SET NOT NULL, ALTER COLUMN "end" SET NOT NULL;
    ALTER TABLE charging_session ADD CHECK ("start" < "end"), ADD CONSTRAINT no_overlapping_sessions EXCLUDE USING gist (
      "pointId" WITH =, tstzrange("start","end",'[)') WITH &&
    ) DEFERRABLE INITIALLY DEFERRED;
    ALTER TABLE scenario ADD UNIQUE (id,"versionNo");
    ALTER TABLE vehicle ADD CHECK (battery BETWEEN 0 AND 100);
    ALTER TABLE charging_point ADD CHECK (rate > 0);
    ALTER TABLE charging_request ADD CHECK (status IN ('CHO_XEP_LICH','DA_XEP_LICH','DANG_SAC','XONG','HUY'));
    ALTER TABLE incident ADD CHECK (status IN ('MOI','TU_CHOI','DANG_XU_LY','DA_DONG'));
    ALTER TABLE simulation_run ADD CHECK (status IN ('RUNNING','COMPLETED','INCOMPLETE','TIMED_OUT'));
    ALTER TABLE coordination_recommendation ADD CHECK (status IN ('NOT_APPLIED','APPLIED','SKIPPED','FAILED'));
    ALTER TABLE rebalancing_order ADD CHECK ("sourceHubId" <> "destHubId" AND cardinality("vehicleIds") = cardinality("spotIds"));
    ALTER TABLE charging_session ADD FOREIGN KEY ("requestId") REFERENCES charging_request(id) DEFERRABLE INITIALLY DEFERRED,
      ADD FOREIGN KEY ("pointId") REFERENCES charging_point(id) DEFERRABLE INITIALLY DEFERRED;
    ALTER TABLE charging_request ADD FOREIGN KEY ("vehicleId") REFERENCES vehicle(id) DEFERRABLE INITIALLY DEFERRED;
    ALTER TABLE simulation_run ADD FOREIGN KEY ("scenarioId","scenarioVersion") REFERENCES scenario(id,"versionNo") DEFERRABLE INITIALLY DEFERRED,
      ADD FOREIGN KEY ("snapshotId") REFERENCES network_snapshot(id) DEFERRABLE INITIALLY DEFERRED;
    ALTER TABLE coordination_recommendation ADD FOREIGN KEY ("runId") REFERENCES simulation_run(id) DEFERRABLE INITIALLY DEFERRED;
  `);
  for (const [table,column] of [
    ['vehicle','hubId'],['parking_spot','hubId'],['charging_point','hubId'],['charging_request','hubId'],
    ['overload_alert','hubId'],['hub_metric_record','hubId'],['trip','hubId'],['reservation','hubId'],
    ['rebalancing_order','sourceHubId'],['rebalancing_order','destHubId'],['coordination_recommendation','hubId'],
  ]) pgm.sql('ALTER TABLE ' + sqlIdentifier(table) + ' ADD FOREIGN KEY (' + sqlIdentifier(column) + ') REFERENCES hub(id) DEFERRABLE INITIALLY DEFERRED');
}
export function down(pgm) {
  pgm.sql('DROP TABLE ' + Object.values(definitions).map(([table]) => sqlIdentifier(table)).join(', '));
}
