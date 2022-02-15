import { IUser } from '@models/user-model';
import orm from './mock-orm';



/**
 * Get one user.
 * 
 * @param email 
 * @returns 
 */
/*async function getOne(email: string): Promise<IUser | null> {
    const db = await orm.openDb();
    for (const user of db.users) {
        if (user.email === email) {
            return user;
        }
    }
    return null;
}*/


/**
 * See if a user with the given id exists.
 * 
 * @param id 
 */
async function persists(id: number): Promise<boolean> {
    const db = await orm.openDb();
    for (const user of db.users) {
        if (user.id === id) {
            return true;
        }
    }
    return false;
}


/**
 * Get all users.
 * 
 * @returns 
 */
async function getAll(): Promise<IUser[]> {
    const db = await orm.openDb();
    return db.users;
}


/**
 * Update a user.
 * 
 * @param user 
 * @returns 
 */
async function update(user: IUser): Promise<void> {
    const db = await orm.openDb();
    for (let i = 0; i < db.users.length; i++) {
        if (db.users[i].id === user.id) {
            db.users[i] = user;
            return orm.saveDb(db);
        }
    }
}


/**
 * Delete one user.
 * 
 * @param id 
 * @returns 
 */
async function deleteOne(id: number): Promise<void> {
    const db = await orm.openDb();
    for (let i = 0; i < db.users.length; i++) {
        if (db.users[i].id === id) {
            db.users.splice(i, 1);
            return orm.saveDb(db);
        }
    }
}


// Export default
export default {
    persists,
    getAll,
    update,
    delete: deleteOne,
} as const;
