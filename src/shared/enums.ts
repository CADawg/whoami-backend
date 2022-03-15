enum UserCreationStatus {
    Success,
    Failed,
    EmailTaken,
    UsernameTaken,
    InvalidUsername,
    InvalidEmail,
    InvalidPasswordHashing,
    InvalidPrivateKey
}

export {UserCreationStatus};