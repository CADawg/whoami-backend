import { Router } from 'express';
import {createUserByUsername, emailIsTaken, getUserByUsername, usernameIsTaken} from "@daos/user";
import {verify} from "@node-rs/argon2";
import {emailRegex, usernameRegex} from "@shared/regex";
import {getUserCreationStatusMessage} from "@shared/functions";
import {UserCreationStatus} from "@shared/enums";

// Export the base-router
const loginRouter = Router();

loginRouter.post('/sign_in', async (req, res) => {
  if (req.body.username && req.body.password) {
      const user = await getUserByUsername(req.body.username);
      try {
          if (user && await verify(user.password, req.body.password)) {
              res.json({
                  success: true,
                  user: user
              });
          } else {
              res.json({
                  success: false,
                  message: 'Invalid username or password'
              });
          }
      } catch (e) {
          res.json({
              success: false,
              message: 'Invalid username or password'
          });
      }
  }
});

loginRouter.post('/sign_up', async (req, res) => {
    // Validate that the body contains the required fields
    if (req.body.username && req.body.password && req.body.email && req.body.encryptedShares) {
        // We don't validate as all the validation is done inside the createUserByUsername function
        // This ensures that we can NEVER skip validation
        const userCreationStatus = await createUserByUsername(req.body.username, req.body.password, req.body.email, req.body.encryptedShares);

        return res.json({
            success: userCreationStatus === UserCreationStatus.Success,
            message: getUserCreationStatusMessage(userCreationStatus)
        });
    } else {
        return res.json({
            success: false,
            message: 'Missing required fields'
        });
    }
});

loginRouter.post('/validate/username', async (req, res) => {
    if (req.body.username) {
        const taken = await usernameIsTaken(req.body.username);

        if (req.body.username.toLowerCase().match(usernameRegex) === null) {
            return res.json({
                success: true,
                available: false,
                valid: false,
                message: 'Username is invalid'
            });
        }


        return res.json({
            success: true,
            available: !taken,
            valid: true,
            message: taken ? 'Username is taken' : 'Username is available'
        });
    } else {
        return res.json({
            success: false,
            message: 'Username is required'
        });
    }
});

loginRouter.post('/validate/email', async (req, res) => {
    if (req.body.email) {
        const taken = await emailIsTaken(req.body.email);

        if (req.body.email.toLowerCase().match(emailRegex) === null) {
            return res.json({
                success: true,
                available: false,
                valid: false,
                message: 'Email is invalid'
            });
        }

        return res.json({
            success: true,
            available: !taken,
            valid: true,
            message: taken ? 'Email is taken' : 'Email is available'
        });
    } else {
        return res.json({
            success: false,
            message: 'Email is required'
        });
    }
});

// Export default.
export default loginRouter;