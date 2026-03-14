import { Module } from '@nestjs/common';
import { GeminiGateway } from './gemini.gateway';

@Module({
  imports: [],
  controllers: [],
  providers: [GeminiGateway], // เพิ่มตรงนี้
})
export class AppModule {}