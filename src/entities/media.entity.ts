import { Column, DataType, Model, Table } from "sequelize-typescript";

@Table
export class Media extends Model {
    @Column({
        type: DataType.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
    })
    mediaId!: number;
    
    @Column({
        type: DataType.INTEGER,
        allowNull: false,
        
    })
    mediaTypeId!: number;
    
    @Column({
        type: DataType.STRING,
        allowNull: false,
    })
    mediaLocation!: string;
    
    @Column({
        type: DataType.STRING,
        allowNull: false,
    })
    userId!: string;
}