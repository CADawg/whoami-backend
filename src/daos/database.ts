import mysql from "mysql2";

// database pool
const dbPoolSync = mysql.createPool({
    connectionLimit: 10,
    host: process.env.SQL_HOST,
    user: process.env.SQL_USER,
    password: process.env.SQL_PASSWORD,
    database: process.env.SQL_DATABASE,
    charset: "utf8mb4"
});

const dbPool = dbPoolSync.promise();

export {dbPool, dbPoolSync};