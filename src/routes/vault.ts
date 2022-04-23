// define default react router router
import express from 'express';
// Use Items and SubItems
import { Item, SubItem } from '@models/items_model';
import { dbPool } from "@daos/database";
import {isOkPacket, isRowOrRows} from "@shared/guards";
import {getUserByUsername} from "@daos/user";

const router = express.Router();

// Get a user's vault
router.get('/items', async (req, res) => {
    if (req.session && req.session.user) {
        const userName = req.session.user;
        const user = await getUserByUsername(userName);

        if (!user) {
            return res.json({
                success: true,
                error: 'User not found'
            });
        }

        const query = `SELECT * FROM items WHERE user_id = ?`;
        const [rows] = await dbPool.query(query, [user.user_id]);

        const subitemQuery = `SELECT * FROM subitems WHERE (select user_id from items WHERE items.item_id = subitems.item_id) = ?`;
        const [subitemRows] = await dbPool.query(subitemQuery, [user.user_id]);

        if (isRowOrRows(rows) && isRowOrRows(subitemRows)) {
            let items: Item[] = rows.map((row: any) => {
                let subitems = [...subitemRows].filter((subitem: any) => subitem.item_id === row.item_id);
                return {
                    item_id: row.item_id,
                    user_id: row.user_id,
                    type: row.type,
                    name: row.name,
                    subitems: subitems as SubItem[]
                };
            });

            res.json({success:true, data: items});
        } else {
            res.json({success:false, error: 'Database error'});
        }
    } else {
       res.json({
           success: false,
           error: "You must be logged in to view your vault."
       });
    }
});

// Add an item to the user's vault (including subitems)
router.post('/items', async (req, res) => {
    if (req.session && req.session.user) {
        const userName = req.session.user;
        const user = await getUserByUsername(userName);

        if (!user) {
            res.json({
                success: false,
                error: "You must be logged in to view your vault."
            });
            return;
        }

        // check if req.body is valid
        if (!req.body.name || !req.body.type || !req.body.subitems) {
            res.json({success:false, error: 'Invalid request'});
            return;
        }

        // Check if type is in the acceptedTypes array
        //const acceptedTypes = ['account_binance', 'bank_current_uk', 'secure_note'];

        //if (!acceptedTypes.includes(req.body.type)) {
        //    res.json({success:false, error: 'Invalid type'});
        //    return;
        //}

        // Validate each subitem
        const subitems = req.body.subitems as SubItem[];

        for (const subitem of subitems) {
            if (!subitem.subitem_type || !subitem.subitem_value) {
                res.json({success:false, error: 'Invalid subitem'});
                return;
            }
        }


        const item = req.body as Item;
        const query = `INSERT INTO items (user_id, name, type) VALUES (?, ?, ?)`;
        const [rows] = await dbPool.query(query, [user.user_id, item.name, item.type]);

        if (isOkPacket(rows)) {
            const itemId = rows.insertId;
            const subitems = item.subitems as SubItem[];
            const subquery = `INSERT INTO subitems (item_id, subitem_type, subitem_value) VALUES ?`;
            const [subrows] = await dbPool.query(subquery, [subitems.map(subitem => [itemId, subitem.subitem_type, subitem.subitem_value])]);

            if (isOkPacket(subrows) && subrows.affectedRows === subitems.length) {
                res.json({success:true, data: {item_id: itemId}});
            } else {
                res.json({success:false, error: 'Database error'});
            }
        } else {
            res.json({success:false, error: 'Database error'});
        }
    } else {
        res.json({
            success: false,
            error: "You must be logged in to view your vault."
        });
    }
});

// Update a single item in the user's vault
router.post('/update', async (req, res) => {
    if (req.session && req.session.user) {
        const userName = req.session.user;
        const user = await getUserByUsername(userName);

        if (!user) {
            return res.json({
                success: false,
                error: "You must be logged in to view your vault."
            });
        }

        // check if req.body is valid
        if (!req.body.item_id || !req.body.name || !req.body.subitems) {
            return res.json({success: false, error: 'Invalid request'});
        }

        // Check if type is in the acceptedTypes array
        //const acceptedTypes = ['password', 'binance', 'bank_current_account_uk', 'custom'];

        //if (!acceptedTypes.includes(req.body.type)) {
        //    return res.json({success: false, error: 'Invalid type'});
        //}

        // Validate each subitem
        const subitems = req.body.subitems as SubItem[];

        for (const subitem of subitems) {
            if (!subitem.subitem_type || !subitem.subitem_value) {
                return res.json({success: false, error: 'Invalid subitem'});
            }
        }

        const item = req.body as Item;
        // Adding user_id ensures that only the user can update their own vault
        const query = `UPDATE items SET name = ? WHERE item_id = ? AND user_id = ?`;
        const [rows] = await dbPool.query(query, [item.name, item.item_id, user.user_id]);

        if (isOkPacket(rows) && rows.affectedRows === 1) {

            // loop through subitems and update them

            const subquery = `INSERT INTO subitems (item_id, subitem_id, subitem_type, subitem_value) VALUES ? ON DUPLICATE KEY UPDATE subitem_type = VALUES(subitem_type), subitem_value = VALUES(subitem_value)`;
            const [subrows] = await dbPool.query(subquery, [subitems.map(subitem => [subitem.item_id, subitem.subitem_id, subitem.subitem_type, subitem.subitem_value])]);

            if (isOkPacket(subrows) && subrows.affectedRows >= subitems.length) {
                res.json({success:true, data: {item_id: item.item_id}});
            } else {
                res.json({success:false, error: 'Database error'});
            }
        } else {
            res.json({success: false, error: 'Incorrect User or Item'});
        }


    } else {
        res.json({
            success: false,
            error: "You must be logged in to view your vault."
        });
    }
});

// delete item (subitems are deleted automatically by mysql foreign key)
router.post('/delete', async (req, res) => {
    if (req.session && req.session.user) {
        const userName = req.session.user;
        const user = await getUserByUsername(userName);

        if (!user) {
            return res.json({
                success: false,
                error: "You must be logged in to view your vault."
            });
        }

        // check if req.body is valid
        if (!req.body.item_id) {
            return res.json({success: false, error: 'Invalid request'});
        }

        const query = `DELETE FROM items WHERE item_id = ? AND user_id = ?`;
        const [rows] = await dbPool.query(query, [req.body.item_id, user.user_id]);

        if (isOkPacket(rows) && rows.affectedRows === 1) {
            res.json({success:true, data: {item_id: req.body.item_id}});
        } else {
            res.json({success: false, error: 'Incorrect User or Item'});
        }

    } else {
        res.json({
            success: false,
            error: "You must be logged in to view your vault."
        });
    }
});

export default router;