import express from 'express';
import {getUserByEmail, getUserByUsername} from "@daos/user";
import {dbPool} from "@daos/database";
import {isOkPacket, isRowOrRows} from "@shared/guards";
import argon2 from '@node-rs/argon2';
const router = express.Router();


router.post('/publickey', async (req, res) => {
  if (req.body.email) {
      const user = await getUserByEmail(req.body.email);

      if (user) {
          res.json({
              success: true,
              publicKey: user.public_key
          });
      } else {
          res.json({
              success: false,
              message: 'User not found'
          });
      }
  } else {
      res.json({
          success: false,
          message: 'Email not provided'
      });
  }
});

router.delete('/deleteTrusted', async (req, res) => {
    if (req.body.requestId) {
        const user = await getUserByUsername(req.session?.user);

        if (user) {
            const [result] = await dbPool.query(`DELETE FROM recovery WHERE from_id = ? AND recovery_id = ?`, [user.user_id, req.body.requestId]);

            if (isOkPacket(result)) {
                res.json({
                    success: true,
                    message: 'Trusted user deleted'
                });
            } else {
                res.json({
                    success: false,
                    message: 'Trusted user not deleted'
                });
            }
        } else {
            res.json({
                success: false,
                message: 'User not found'
            });
        }
    }
});

// add recovery agent
router.post('/addTrusted', async (req, res) => {
    if (req.session && req.session.user) {
        const user = await getUserByUsername(req.session.user);

        if (!user) {
            return res.json({
                success: false,
                message: 'User not found'
            });
        }

        if (req.body.email && req.body.share) {
            // add to recovery database
            const emailUser = await getUserByEmail(req.body.email);

            if (!emailUser) {
                return res.json({
                    success: false,
                    message: 'Recipient not found'
                });
            }

            // insert into recovery table
            const [response] = await dbPool.query("INSERT INTO recovery (from_id, to_id, share) VALUES (?, ?, ?)", [user.user_id, emailUser.user_id, req.body.share]);

            if (isOkPacket(response) && response.affectedRows === 1) {
                return res.json({
                    success: true,
                    message: 'Recovery agent requested'
                });
            } else {
                return res.json({
                    success: false,
                    message: 'Recovery agent not added'
                });
            }
        }
    }
});

// get the user's trusted parties (from_id)
router.get('/getTrusted', async (req, res) => {
    if (req.session && req.session.user) {
        const user = await getUserByUsername(req.session.user);

        if (!user) {
            return res.json({
                success: false,
                message: 'User not found'
            });
        }

        // get the user's trusted parties
        const [response] = await dbPool.query("SELECT *, (select email from users WHERE user_id=recovery.to_id) as email FROM recovery WHERE from_id = ?", [user.user_id]);

        if (isRowOrRows(response)) {
            return res.json({
                success: true,
                trusted: response
            });
        } else {
            return res.json({
                success: false,
                message: 'No trusted parties'
            });
        }
    }
});

// get all recovery requests with the signed in user as the to_id
router.get('/getRecoveryRequests', async (req, res) => {
    if (req.session && req.session.user) {
        const user = await getUserByUsername(req.session.user);

        if (!user) {
            return res.json({
                success: false,
                message: 'User not found'
            });
        }

        const [response] = await dbPool.query("SELECT *, (select email from users WHERE user_id=recovery.from_id) as email FROM recovery WHERE to_id = ?", [user.user_id]);

        if (isRowOrRows(response)) {
            return res.json({
                success: true,
                requests: response
            });
        } else {
            return res.json({
                success: false,
                message: 'Recovery requests not found'
            });
        }
    }
});

// Approve a single recovery agent request (as the to_id)
router.post('/approveRecoveryRequest', async (req, res) => {
    if (req.session && req.session.user) {
        const user = await getUserByUsername(req.session.user);

        if (!user) {
            return res.json({
                success: false,
                message: 'User not found'
            });
        }

        if (req.body.requestId) {
            const [response] = await dbPool.query("UPDATE recovery SET accepted = 1 WHERE recovery_id = ? AND to_id = ?", [req.body.requestId, user.user_id]);

            if (isOkPacket(response) && response.affectedRows === 1) {
                return res.json({
                    success: true,
                    message: 'Recovery agent approved'
                });
            } else {
                return res.json({
                    success: false,
                    message: 'Recovery agent not approved'
                });
            }
        }
    }

    return res.json({
        success: false,
        message: 'Invalid request'
    });
});

// Reject a single recovery agent request (as the to_id)
router.post('/rejectRecoveryRequest', async (req, res) => {
    if (req.session && req.session.user) {
        const user = await getUserByUsername(req.session.user);

        if (!user) {
            return res.json({
                success: false,
                message: 'User not found'
            });
        }

        if (req.body.requestId) {
            const [response] = await dbPool.query("DELETE FROM recovery WHERE recovery_id = ? AND to_id = ?", [req.body.requestId, user.user_id]);

            if (isOkPacket(response) && response.affectedRows === 1) {
                return res.json({
                    success: true,
                    message: 'Recovery agent rejected'
                });
            } else {
                return res.json({
                    success: false,
                    message: 'Recovery agent not rejected'
                });
            }
        }
    }

    return res.json({
        success: false,
        message: 'Invalid request'
    });
});

// Start account recovery process (create a temporary account for the user in the recovery_process table) [recoverer_id, account_to_recover, public_key, private_key, new_password_hash]
router.post('/startRecovery', async (req, res) => {
    if (req.body.accountToRecover && req.body.publicKey && req.body.privateKey && req.body.newPasswordHash) {
        const accountRecover = await getUserByUsername(req.body.accountToRecover);

        if (!accountRecover) {
            return res.json({
                success: false,
                message: 'Account to recover not found'
            });
        }

        const argonHashedPassword = await argon2.hash(req.body.newPasswordHash);


        const [response] = await dbPool.query("INSERT INTO recovery_process (account_to_recover, public_key, private_key, new_password_hash) VALUES (?, ?, ?, ?)", [accountRecover.user_id, req.body.publicKey, req.body.privateKey, argonHashedPassword]);

        if (isOkPacket(response) && response.affectedRows === 1) {
            return res.json({
                success: true,
                message: 'Recovery process started',
                id: response.insertId
            });
        } else {
            return res.json({
                success: false,
                message: 'Recovery process not started'
            });
        }
    }
});

// Get all the recovery_process accounts which this user can recover
// SELECT * FROM `recovery_process` LEFT JOIN recovery ON recovery_process.account_to_recover = recovery.from_id WHERE accepted = 1 and (select count(*) from recovery_process_replacement_shares WHERE given_by = ?) < 1 and to_id = ?;
router.get('/getRecoveryProcess', async (req, res) => {
    if (req.session && req.session.user) {
        const user = await getUserByUsername(req.session.user);

        if (!user) {
            return res.json({
                success: false,
                message: 'User not found'
            });
        }

        const [response] = await dbPool.query("SELECT *,(select email from users WHERE user_id=recovery_process.account_to_recover) as email FROM `recovery_process` LEFT JOIN recovery ON recovery_process.account_to_recover = recovery.from_id WHERE accepted = 1 and (select count(*) from recovery_process_replacement_shares WHERE given_by = ?) < 1 and to_id = ?;", [user.user_id, user.user_id]);

        if (isRowOrRows(response)) {
            return res.json({
                success: true,
                data: response
            });
        } else {
            return res.json({
                success: false,
                message: 'Recovery process not found'
            });
        }
    }

    return res.json({
        success: false,
        message: 'Invalid request'
    });
});

router.post('/getBackupShare', async (req, res) => {
    if (req.session && req.session.user) {
        const user = await getUserByUsername(req.session.user);

        if (!user) {
            return res.json({
                success: false,
                message: 'User not found'
            });
        }

        if (!req.body.from) {
            return res.json({
                success: false,
                message: 'Invalid request'
            });
        }

        const [response] = await dbPool.query("SELECT * FROM `recovery` WHERE to_id = ? and from_id = ? LIMIT 1", [user.user_id, req.body.from]);

        if (isRowOrRows(response)) {
            return res.json({
                success: true,
                data: response
            });
        } else {
            return res.json({
                success: false,
                message: 'Recovery process not found'
            });
        }
    }

    return res.json({
        success: false,
        message: 'Invalid request'
    });
});

// Submit a new share for the account being recovered
// INSERT INTO `recovery_process_replacement_shares` (recovery_user_id, share, given_by) VALUES (?, ?, ?);
router.post('/submitReplacementShare', async (req, res) => {
    if (req.body.recoveryUserId && req.body.share) {
        const user = await getUserByUsername(req.session?.user);

        if (!user) {
            return res.json({
                success: false,
                message: 'User not found'
            });
        }

        // check if user can give a share (is in recovery table with to_id = user_id and from_id = recovery_user_id)
        const [rows] = await dbPool.query("SELECT * FROM recovery WHERE to_id = ? and from_id = ? and accepted = 1", [user.user_id, req.body.recoveryUserId]);
        if (isRowOrRows(rows) && rows.length === 0) {
            return res.json({
                success: false,
                message: 'User cannot give a share'
            });
        }


        const [response] = await dbPool.query("INSERT INTO `recovery_process_replacement_shares` (recovery_user_id, share, given_by) VALUES (?, ?, ?);", [req.body.recoveryUserId, req.body.share, user.user_id]);

        if (isOkPacket(response) && response.affectedRows === 1) {
            return res.json({
                success: true,
                message: 'Replacement share submitted'
            });
        } else {
            return res.json({
                success: false,
                message: 'Replacement share not submitted'
            });
        }
    }
});

// get number of shares submitted already
// SELECT count(*) FROM `recovery_process_replacement_shares` WHERE recovery_user_id = ?;
router.get('/getReplacementShares', async (req, res) => {

    const [response] = await dbPool.query("SELECT count(*) as count FROM `recovery_process_replacement_shares` WHERE recovery_user_id = ?;", [req.body.recoveryUserId]);

    if (isOkPacket(response)) {
        return res.json({
            success: true,
            data: response
        });
    } else {
        return res.json({
            success: false,
            message: 'Replacement shares not found'
        });
    }
});

// Get shares so that the user can decrypt and reencrypt them
router.post("/recoveryDetails", async (req, res) => {
    if (!req.body.recoveryUserId) {
        return res.json({
            success: false,
            message: 'Invalid request'
        });
    }

    const [response] = await dbPool.query("SELECT * FROM `recovery_process_replacement_shares` WHERE (select account_to_recover from recovery_process WHERE recoverer_id = ?) = recovery_process_replacement_shares.recovery_user_id;", [req.body.recoveryUserId]);

    if (isRowOrRows(response)) {
        return res.json({
            success: true,
            data: response
        });
    } else {
        return res.json({
            success: false,
            message: 'Recovery process not found'
        });
    }
});

// Complete account recovery
// Needs at least 2 shares from distinct users in the recovery process replacement shares table
// Replace user's account with the data from recovery table
router.post("/completeRecovery", async (req, res) => {
    if (!req.body.replacementShares) {
        return res.json({
            success: false,
            message: 'Invalid request'
        });
    }

    if (req.body.replacementShares.length < 2) {
        return res.json({
            success: false,
            message: 'Not enough shares'
        });
    }

    // get recovery user
    const [recoveryUser] = await dbPool.query("SELECT * FROM `recovery_process` WHERE account_to_recover = ?;", [req.body.recoveryUserId]);

    if (isRowOrRows(recoveryUser) && recoveryUser.length === 1) {
        const user = recoveryUser[0] as {new_password_hash: string, account_to_recover: number};


        const [updateUser] = await dbPool.query("UPDATE `users` SET password=? WHERE user_id=?", [user.new_password_hash, req.body.recoveryUserId]);

        if (isOkPacket(updateUser) && updateUser.affectedRows === 1) {
            // update shares

            // delete all shares where encrypted by and applies_to are user.account_to_recover
            const [deleteShares] = await dbPool.query("DELETE FROM `shamir_shares` WHERE encrypted_by = ? AND applies_to = ?;", [user.account_to_recover, user.account_to_recover]);



            if (isOkPacket(deleteShares)) {
                // insert new shares

                const [insertShare1] = await dbPool.query("INSERT INTO `shamir_shares` (encrypted_by, applies_to, share_value) VALUES (?,?,?);", [user.account_to_recover, user.account_to_recover, req.body.replacementShares[0]]);
                const [insertShare2] = await dbPool.query("INSERT INTO `shamir_shares` (encrypted_by, applies_to, share_value) VALUES (?,?,?);", [user.account_to_recover, user.account_to_recover, req.body.replacementShares[1]]);

                if (isOkPacket(insertShare1) && isOkPacket(insertShare2)) {
                    // delete recovery data
                    const [deleteRecoveryData] = await dbPool.query("DELETE FROM `recovery_process` WHERE account_to_recover = ?;", [user.account_to_recover]);

                    // delete recovery shares
                    const [deleteRecoveryShares] = await dbPool.query("DELETE FROM `recovery_process_replacement_shares` WHERE recovery_user_id = ?;", [user.account_to_recover]);

                    if (isOkPacket(deleteRecoveryData) && isOkPacket(deleteRecoveryShares)) {
                        return res.json({
                            success: true,
                            message: 'Recovery completed'
                        });
                    } else {
                        return res.json({
                            success: false,
                            message: 'Recovery failed'
                        });
                    }
                } else {
                    return res.json({
                        success: false,
                        message: 'Could not insert shares'
                    });
                }
            } else {
                return res.json({
                    success: false,
                    message: 'Shares not updated'
                });
            }
        } else {
            return res.json({
                success: false,
                message: 'User not updated'
            });
        }


    } else {
        return res.json({
            success: false,
            message: 'Recovery user not found'
        });
    }


});



export default router;