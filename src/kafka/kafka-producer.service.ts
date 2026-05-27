import { Inject, Injectable, Logger } from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';

@Injectable()
export class KafkaProducerService {
  private readonly logger = new Logger(KafkaProducerService.name);

  constructor(@Inject('KAFKA_CLIENT') private readonly kafkaClient: ClientKafka) {}

  async emit(topic: string, payload: Record<string, any>): Promise<void> {
    try {
      this.kafkaClient.emit(topic, payload);
    } catch (error) {
      this.logger.error(`Failed to emit to topic '${topic}': ${error.message}`);
    }
  }
}
