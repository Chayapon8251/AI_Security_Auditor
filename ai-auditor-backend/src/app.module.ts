import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config'; // ต้องลงแพ็คเกจ @nestjs/config ก่อน
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { GeminiGateway } from './gemini/gemini.gateway';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true, // ทำให้เรียกใช้ process.env ได้จากทุกที่โดยไม่ต้อง import ซ้ำ
    }),
  ],
  controllers: [AppController],
  providers: [AppService, GeminiGateway],
})
export class AppModule {}