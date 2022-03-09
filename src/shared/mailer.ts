import nodemailer from 'nodemailer';
import handlebars from 'handlebars';
import fs from 'fs';
import path from 'path';
import {convert} from 'html-to-text';

function getTemplates(name: string): string {
  return fs.readFileSync(path.join(__dirname, '../email_templates/', name + ".html"), 'utf8').toString();
}

function generateEmailFromTemplates(name: string, data: any): string {
  const html = getTemplates(name);
  const template = handlebars.compile(html);
  return template(data);
}

export default async function sendEmail(template: string, data: any, subject: string, to: string, from: string): Promise<boolean> {
    try {
        const html = generateEmailFromTemplates(template, data);

        const transporter = nodemailer.createTransport({
            host: process.env.MAIL_SERVER,
            port: 465,
            secure: true,
            auth: {
                user: process.env.MAIL_USERNAME,
                pass: process.env.MAIL_PASSWORD
            }
        });
        const mailOptions = {
            from: from,
            to: to,
            subject: subject,
            text: convert(html, {wordwrap: 130}),
            html: html
        };
        await transporter.sendMail(mailOptions);

        return true;
    } catch (error) {
        return false;
    }
}