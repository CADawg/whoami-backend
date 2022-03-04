enum UserCreationStatus {
    Success,
    Failed,
    EmailTaken,
    UsernameTaken,
    InvalidUsername,
    InvalidEmail,
    InvalidPasswordHashing
}

export {UserCreationStatus};