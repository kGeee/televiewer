
import Database from 'better-sqlite3';
const db = new Database('data.db');

const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log('Tables:', tables.map(t => t.name));

const vbo = tables.find(t => t.name === 'vbo_telemetry');
if (vbo) {
    const columns = db.prepare("PRAGMA table_info(vbo_telemetry)").all();
    console.log('vbo_telemetry columns:', columns.map(c => c.name));
} else {
    console.log('vbo_telemetry table NOT found');
}
