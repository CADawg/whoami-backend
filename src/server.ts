import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import path from 'path';
import helmet from 'helmet';
import session from 'express-session';
const MySQLStore = require('express-mysql-session')(session);

import express, { NextFunction, Request, Response } from 'express';
import 'express-async-errors';

import apiRouter from './routes/api';
import { CustomError } from '@shared/errors';
import {dbPool} from "@daos/database";


// Constants
const app = express();

// Database Session Store with our dbPool
const sessionStore = new MySQLStore({}, dbPool);


/***********************************************************************************
 *                                  Middlewares
 **********************************************************************************/

// Common middlewares
app.use(express.json());
app.use(express.urlencoded({extended: true}));
app.use(cookieParser());
// noinspection SpellCheckingInspection
app.use(session({
    secret: process.env.SESSION_SECRET as string,
    saveUninitialized: true,
    store: sessionStore,
    resave: false,
    cookie: {httpOnly: true, secure: process.env.NODE_ENV === 'production'},
}));

// Show routes called in console during development
if (process.env.NODE_ENV === 'development') {
    app.use(morgan('dev'));
}

// Security (helmet recommended in express docs)
if (process.env.NODE_ENV === 'production') {
    app.use(helmet());
}

/***********************************************************************************
 *                         Reverse Proxy Support (Caddy)
 **********************************************************************************/
// Trust first proxy in production
if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1);


/***********************************************************************************
 *                         API routes and error handling
 **********************************************************************************/

// Add api router
app.use('/api/v1', apiRouter);

// Error handling
app.use((err: Error | CustomError, _: Request, res: Response, __: NextFunction) => {
    console.error(err, true);
    const status = (err instanceof CustomError ? err.HttpStatus : 400);
    return res.status(status).json({
        error: err.message,
    });
});


/***********************************************************************************
 *                                  Front-end content
 **********************************************************************************/

// Set static dir
const staticDir = path.join(__dirname, 'public');
app.use(express.static(staticDir));

// Serve index.html file
app.get('*', (_: Request, res: Response) => {
    res.sendFile('index.html', {root: staticDir});
});



// Export here and start in a diff file (for testing).
export default app;
