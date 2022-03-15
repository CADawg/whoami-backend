import { Router } from 'express';
import {
    createUserByUsername,
    emailIsTaken, getUserByUserId,
    getUserByUsername, getUserPersonalShares, sendVerificationEmail, tryVerifyEmail, updateEmail,
    usernameIsTaken
} from "@daos/user";
import {verify} from "@node-rs/argon2";
import {emailRegex, usernameRegex} from "@shared/regex";
import {getUserCreationStatusMessage} from "@shared/functions";
import {UserCreationStatus} from "@shared/enums";

// Export the base-router
const loginRouter = Router();

loginRouter.post('/sign_in', async (req, res) => {
  if (req.body.username && req.body.password) {
      const user = await getUserByUsername(req.body.username);

      const shares = await getUserPersonalShares(user)

      try {
          // We can put shares in here as if the user is not null, shares will not be null either
          if (user && shares && await verify(user.password, req.body.password)) {
              if (req.session) req.session.user = user.username;

              res.json({
                  success: true,
                  data: {emailVerified: user.email_verified, shares, keypair: {publicKey: user.public_key, encryptedPrivateKey: user.private_key}},
                  message: 'User logged in successfully'
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
    if (req.body.username && req.body.password && req.body.email && req.body.encryptedShares && req.body.encryptedPrivateKey && req.body.publicKey) {
        // We don't validate as all the validation is done inside the createUserByUsername function
        // This ensures that we can NEVER skip validation
        const userCreationStatus = await createUserByUsername(req.body.username, req.body.password, req.body.email, req.body.encryptedShares, req.body.encryptedPrivateKey, req.body.publicKey);

        if (userCreationStatus === UserCreationStatus.Success) {
            if (req.session) req.session.user = req.body.username.toLowerCase();

            await sendVerificationEmail(await getUserByUsername(req.body.username.toLowerCase()));
        }

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

/**
 * This route checks whether a user has already verified their email address
 * Success = true if the request was successful
 * data.verified = true if the user has verified their email address
 * message = A descriptive message
 */
loginRouter.post("/is_email_verified", async (req, res) => {
    if (req.session && req.session.user) {
        const user = await getUserByUsername(req.session.user);

        if (user) {
            if (user.email_verified) {
                return res.json({
                    success: true,
                    data: {verified: true, email: user.email},
                    message: 'Email is verified'
                });
            } else {
                return res.json({
                    success: true,
                    data: {verified: false, email: user.email},
                    message: 'Email is not verified',
                });
            }
        } else {
            return res.json({
                success: false,
                message: "User not found",
                data: {verified: false, email: ""}
            });
        }
    } else {
        return res.json({
            success: false,
            message: "User not found",
            data: {verified: false, email: ""}
        });
    }
});

//returns {success: boolean, message: string, data: {verified: boolean}}
loginRouter.post('/verify_email_code_status', async (req, res) => {
    if (req.body.email && req.body.code) {
        const decodedEmail = Buffer.from(req.body.email, 'base64url').toString('utf8');

        const status = await tryVerifyEmail(decodedEmail, req.body.code);

        if (status[0]) {
            const user = await getUserByUserId(status[1]);
            if (user) {

                let isThisUser = false;
                if (req.session && req.session.user) {
                    isThisUser = req.session.user === user.username;
                }

                return res.json({
                    success: true,
                    message: 'Email verified',
                    data: {verified: true, isThisUser}
                });
            } else {
                return res.json({
                    success: true,
                    message: 'Email verified, but user not found',
                    data: {verified: true, isThisUser: false}
                });
            }

        } else {
            return res.json({
                success: false,
                message: 'Email not verified',
                data: {verified: false, isThisUser: false}
            });
        }

    } else {
        return res.json({
            success: false,
            message: 'Missing required fields'
        });
    }
});

loginRouter.post("/update_email", async (req, res) => {
    // Update the session.user's email address
    if (req.session && req.session.user && req.body.email) {
        const user = await getUserByUsername(req.session.user);

        if (user) {
            if (req.body.email.match(emailRegex) === null) {
                return res.json({
                    success: false,
                    message: 'Email is invalid'
                });
            }

            if (await emailIsTaken(req.body.email) && user.email !== req.body.email) return res.json({
                success: false,
                message: 'Email is taken'
            }); // don't update if the email is already taken

            const emailUpdate = await updateEmail(user.username, req.body.email);

            if (emailUpdate) {
                return res.json({
                    success: true,
                    message: 'Email updated'
                });
            } else {
                return res.json({
                    success: false,
                    message: 'Email update failed'
                });
            }
        } else {
            return res.json({
                success: false,
                message: "User not found"
            });
        }
    } else {
        return res.json({
            success: false,
            message: "User not found"
        });
    }
});

loginRouter.post('/verify_email', async (req, res) => {
    if (req.session && req.session.user) {
        const user = await getUserByUsername(req.session.user);

        if (user && user.email_verified) {
            return res.json({
                success: true,
                message: 'Email is already verified'
            });
        }

        if (user) {
            const verificationEmailSent = await sendVerificationEmail(user);

            if (verificationEmailSent) {
                return res.json({
                    success: true,
                    message: 'Email verification sent'
                });
            } else {
                return res.json({
                    success: false,
                    message: 'Could not send verification email'
                });
            }
        } else {
            return res.json({
                success: false,
                message: 'User not found'
            });
        }
    } else {
        return res.json({
            success: false,
            message: 'User is not logged in'
        });
    }
});

loginRouter.post('/logout', (req, res) => {
    if (req.session) req.session.destroy(() => {
        return res.json({
            success: true
        });
    });
});

loginRouter.post('/username', async (req, res) => {
    if (req.session && req.session.user) {
        const user = await getUserByUsername(req.session.user);

        if (user !== null) {
            return res.json({
                success: true,
                message: 'User is logged in',
                data: {
                    username: req.session.user,
                    isVerified: user.email_verified === 1
                }
            });
        } else {
            return res.json({
                success: false,
                message: 'User not found'
            });
        }
    } else {
        return res.json({
            success: false,
            message: 'User is not logged in'
        });
    }
});

// Export default.
export default loginRouter;