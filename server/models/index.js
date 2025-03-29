const { Sequelize } = require('sequelize');
const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'postgres',
  logging: false
});

const models = {
  User: require('./User')(sequelize, Sequelize.DataTypes),
  Letter: require('./Letter')(sequelize, Sequelize.DataTypes)
};

Object.values(models).forEach(model => {
  if (model.associate) model.associate(models);
});

models.User.hasMany(models.Letter, { foreignKey: 'user_id' });
models.Letter.belongsTo(models.User, { foreignKey: 'user_id' });

module.exports = {
  sequelize,
  ...models
};