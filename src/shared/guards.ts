import {OkPacket, RowDataPacket} from "mysql2";

// The type for all rows.
type RowOrRows = RowDataPacket[] | RowDataPacket[][];

/**
 * Checks whether a MYSQL query returns a row or rows.
 */
export function isRowOrRows(toBeDetermined: any): toBeDetermined is RowOrRows {
    return (toBeDetermined as RowOrRows).length !== undefined;
}

// Checks whether a MYSQL query returns an OkPacket.
export function isOkPacket(toBeDetermined: any): toBeDetermined is OkPacket {
    return (toBeDetermined as OkPacket).affectedRows !== undefined;
}