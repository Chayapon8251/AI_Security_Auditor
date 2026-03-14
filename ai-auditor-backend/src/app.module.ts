import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { GeminiGateway } from './gemini/gemini.gateway'; // นำเข้า Gateway

@Module({
  imports: [],
  controllers: [AppController],
  providers: [AppService, GeminiGateway], // เพิ่มตรงนี้
})
export class AppModule {}