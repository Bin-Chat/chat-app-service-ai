import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Kafka consumer microservice
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.KAFKA,
    options: {
      client: {
        clientId: 'ai-service',
        brokers: [process.env.KAFKA_BROKER || 'redpanda:9092'],
      },
      consumer: {
        groupId: 'ai-service-consumer',
      },
    },
  });

  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:5173'],
    credentials: true,
  });

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.setGlobalPrefix('api');

  await app.startAllMicroservices();

  const port = process.env.PORT || 3050;
  await app.listen(port);
  console.log(`AI Service running on port ${port}`);
  console.log(`Kafka consumer connected to ${process.env.KAFKA_BROKER || 'redpanda:9092'}`);
}
bootstrap();
