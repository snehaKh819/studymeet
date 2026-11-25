// Creates the service's own database on first start (the Postgres container
// only creates the one named in POSTGRES_DB), so no manual setup is needed.
import pg from 'pg';

const target = new URL(process.env.DATABASE_URL);
const dbName = decodeURIComponent(target.pathname.slice(1));

if (!/^[A-Za-z0-9_]+$/.test(dbName)) {
  console.error(`Refusing to create database with unsafe name: ${dbName}`);
  process.exit(1);
}

const admin = new URL(target);
admin.pathname = '/postgres';
admin.search = '';

const client = new pg.Client({ connectionString: admin.toString() });
await client.connect();
const { rowCount } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
if (!rowCount) {
  await client.query(`CREATE DATABASE "${dbName}"`);
  console.log(`Created database ${dbName}`);
}
await client.end();
