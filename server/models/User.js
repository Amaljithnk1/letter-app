module.exports = (sequelize, DataTypes) => {
  return sequelize.define('User', {
    uid: {
      type: DataTypes.STRING,
      primaryKey: true
    },
    email: DataTypes.STRING,
    name: DataTypes.STRING,
    driveAccessToken: DataTypes.TEXT,
    driveRefreshToken: DataTypes.TEXT
  }, {
    timestamps: true,
    underscored: true,
    tableName: 'users'
  });
};