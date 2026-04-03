import {
  Repository,
  FindOptionsWhere,
  DeepPartial,
  QueryDeepPartialEntity,
} from 'typeorm';
import { IBaseRepository } from '../../domain/repositories/base.repository.interface';
import { BaseEntity } from '../../domain/entities/base.entity';

export abstract class BaseRepository<
  T extends BaseEntity,
> implements IBaseRepository<T> {
  constructor(protected readonly repository: Repository<T>) {}

  async findById(id: string): Promise<T | null> {
    return this.repository.findOne({
      where: { id } as FindOptionsWhere<T>,
    });
  }

  async findAll(): Promise<T[]> {
    return this.repository.find();
  }

  async create(entity: DeepPartial<T>): Promise<T> {
    const newEntity = this.repository.create(entity);
    return this.repository.save(newEntity);
  }

  async update(id: string, entity: DeepPartial<T>): Promise<T> {
    await this.repository.update(id, entity as QueryDeepPartialEntity<T>);
    return this.findById(id) as Promise<T>;
  }

  async delete(id: string): Promise<void> {
    await this.repository.delete(id);
  }

  async softDelete(id: string): Promise<void> {
    await this.repository.softDelete(id);
  }
}
