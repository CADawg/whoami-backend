import {IUser} from "@models/user-model";
import {dbPool} from "@daos/database";
import {OkPacket, RowDataPacket} from "mysql2";
import {hash} from "@node-rs/argon2";
import {emailRegex, sha512Regex, usernameRegex} from "@shared/regex";
import {UserCreationStatus} from "@shared/enums";

// The type for all rows.
type RowOrRows = RowDataPacket[] | RowDataPacket[][];

/**
 * Checks whether a MYSQL query returns a row or rows.
 */
function isRowOrRows(toBeDetermined: any): toBeDetermined is RowOrRows {
    return (toBeDetermined as RowOrRows).length !== undefined;
}

// Checks whether a MYSQL query returns an OkPacket.
function isOkPacket(toBeDetermined: any): toBeDetermined is OkPacket {
    return (toBeDetermined as OkPacket).affectedRows !== undefined;
}

/**
 * Get one user.
 *
 * @param username The username of the user.
 * @returns
 */
async function getUserByUsername(username: string): Promise<IUser | null> {
    // Set the username to lowercase.
    username = username.toLowerCase();

    const [data] = await dbPool.query(`SELECT * FROM users WHERE username = ?`, [username]);

    // If we received data, and there is one user with this name.
    if (isRowOrRows(data) && data.length === 1) {
        // Return as a user object
        return data[0] as IUser;
    }

    return null;
}

// Check if a username is already taken.
async function usernameIsTaken(username: string): Promise<boolean> {
    const user = await getUserByUsername(username.toLowerCase());

    return user !== null;
}

// Check if the email is already taken.
async function emailIsTaken(email: string): Promise<boolean> {
    // Check if the email is already taken. (Case insensitive)
    const [data] = await dbPool.query(`SELECT * FROM users WHERE LOWER(email) = ?`, [email.toLowerCase()]);

    return isRowOrRows(data) && data.length === 1;
}

/**
 * Create one user
 * @returns True: If the user was created successfully.
 * @returns False: If the user couldn't be created.
 * @returns Null: If the email or username is already in use.
 * @param username The username of the user.
 * @param password The user's hash of their password (which acts like their password)
 * @param email The user's email.
 * @param encryptedShare The user's encrypted share.
 */
async function createUserByUsername(username: string, password: string, email: string, encryptedShare: string):Promise<UserCreationStatus> {
    // Lowercase all login details, to reduce user errors.
    username = username.toLowerCase();

    // Validate the username.
    if (username.match(usernameRegex) === null) {
        return UserCreationStatus.InvalidUsername;
    }

    // Validate the email.
    if (email.match(emailRegex) === null) {
        return UserCreationStatus.InvalidEmail;
    }

    // Check the password is hashed with sha512.
    if (password.match(sha512Regex) === null) {
        return UserCreationStatus.InvalidPasswordHashing;
    }

    // Validate if the username is already taken.
    if (await usernameIsTaken(username)) {
        return UserCreationStatus.UsernameTaken;
    }

    // Validate if the email is already taken.
    if (await emailIsTaken(email)) {
        return UserCreationStatus.EmailTaken;
    }


    try {
        // Hash the already hashed password (hashed on the client side, so we never know the password).
        // We call it "password" because it acts like the password - when sent to us, we return the database.
        let hashedPassword = await hash(password);

        // Insert the user into the database.
        const [userResult] = await dbPool.query(`INSERT INTO users (username, password, email, share_count)
                                                 VALUES (?, ?, ?,
                                                         ?)`, [username, hashedPassword, email, 1]);

        // If we received an OK Response, and one row was affected. (The user was created)
        if (isOkPacket(userResult) && userResult.affectedRows === 1) {
            // Now we need to add the shamir share to the database. (This is what encrypts the data of the user)
            const [shamirResult] = await dbPool.query(`INSERT INTO shamir_shares (encrypted_by, share_value, applies_to)
                                                       VALUES (?, ?,
                                                               ?)`, [userResult.insertId, encryptedShare, userResult.insertId]);

            if (isOkPacket(shamirResult) && shamirResult.affectedRows === 1) {
                return UserCreationStatus.Success;
            } else {
                // If the shamir share was not added, we need to delete the user.
                await dbPool.query(`DELETE
                                    FROM users
                                    WHERE user_id = ?`, [userResult.insertId]);
                return UserCreationStatus.Failed;
            }
        }
    } catch (e){
        console.log(e);
        return UserCreationStatus.Failed;
    }

    // If an error occurred, their email is probably already in use.
    return UserCreationStatus.Failed;
}

export {
    getUserByUsername,
    createUserByUsername,
    usernameIsTaken,
    emailIsTaken
};
