// User schema
export interface IUser {
    user_id: number;
    username: string;
    email: string;
    password: string;
    share_count: number;
    email_verified: number;
    public_key: string;
    private_key: string;
}