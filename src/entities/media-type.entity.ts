import { Column, DataType, Model, Table } from "sequelize-typescript";

@Table
export class MediaType extends Model {
  @Column({
    type: DataType.INTEGER,
    autoIncrement: true,
    primaryKey: true,
    allowNull: false,
  })
  mediaTypeId!: number;

  @Column({
    type: DataType.STRING,
    allowNull: false,
  })
  name!: string;
}
