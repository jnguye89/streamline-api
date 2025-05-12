import { Sequelize } from "sequelize";

export const sequelize = new Sequelize('streamline', 'admin', 'AJz47uGFrXLeuGVTNemp', {
  host: 'streamline.cxi4awg4ko81.us-east-2.rds.amazonaws.com',
  dialect: 'mysql',
  port: 3306,
  logging: false, // optional: disables SQL logging in console,
});

(async () => {
    await sequelize.sync({ force: true });
    // Code here
  })();