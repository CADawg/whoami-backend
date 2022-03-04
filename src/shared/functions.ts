import {UserCreationStatus} from "@shared/enums";

function getUserCreationStatusMessage(status: UserCreationStatus) {
  switch (status) {
    case UserCreationStatus.Success:
      return 'User created successfully';
    case UserCreationStatus.Failed:
      return 'User creation failed';
    case UserCreationStatus.EmailTaken:
      return 'Email is already in use';
    case UserCreationStatus.UsernameTaken:
      return 'Username is already in use';
    case UserCreationStatus.InvalidUsername:
      return 'Username is invalid';
    case UserCreationStatus.InvalidEmail:
      return 'Email is invalid';
    case UserCreationStatus.InvalidPasswordHashing:
      return 'Your password was not submitted successfully';
    default:
      return 'User creation failed';
  }
}

export {getUserCreationStatusMessage};