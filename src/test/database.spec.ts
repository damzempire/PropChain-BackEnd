import { Test, TestingModule } from '@nestjs/testing';
import { HealthService } from '../health/health.service';
import { connectWithRetry } from './database-connection.util';

describe('Database Connection', () => {
  let healthService: HealthService;

  const mockDataSource = {
    initialize: jest.fn().mockResolvedValue(true),
  };

  const badDataSource = {
    initialize: jest.fn().mockRejectedValue(new Error('DB down')),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthService,
        {
          provide: 'DATA_SOURCE',
          useValue: mockDataSource,
        },
      ],
    }).compile();

    healthService = module.get<HealthService>(HealthService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should connect successfully with retry logic', async () => {
    const result = await connectWithRetry(mockDataSource, 3, 1000);

    expect(result).toBeUndefined(); // success path
    expect(mockDataSource.initialize).toHaveBeenCalled();
  });

  it('should fail after retries exhausted', async () => {
    await expect(
      connectWithRetry(badDataSource, 2, 500),
    ).rejects.toThrow();
  });

  it('should return true for healthy connection', async () => {
    const health = await healthService.checkConnection();

    expect(health).toBe(true);
  });
});