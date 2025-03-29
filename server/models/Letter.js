module.exports = (sequelize, DataTypes) => {
  return sequelize.define('Letter', {
    title: DataTypes.STRING,
    content: DataTypes.TEXT
  }, {
    timestamps: true,
    underscored: true,
    tableName: 'letters'
  });
};