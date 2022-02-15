
// User schema
export interface IUser {
    id: number;
    name: string;
    email: string;
}


/**
 * Get a new User object.
 * 
 * @returns 
 */
function getNew(name: string, email: string): IUser {
    return {
        id: -1,
        email,
        name,
    };
}


/**
 * Copy a user object.
 * 
 * @param user 
 * @returns IUser
 */
function copy(user: IUser): IUser {
    return {...user};
}


// Export default
export default {
    new: getNew,
    copy,
}
