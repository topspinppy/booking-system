import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // ── Global Validation Pipe ───────────────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // ── Swagger / OpenAPI ────────────────────────────────────────────────────
  const config = new DocumentBuilder()
    .setTitle('Booking System API')
    .setDescription('ระบบจอง Event')
    .setVersion('1.0')
    .addTag('Events', 'จัดการ Event และ capacity')
    .addTag('Bookings', 'จอง / ยกเลิก / เช็คสถานะ Waitlist')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: { persistAuthorization: true },
  });

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`🚀 Booking API  → http://localhost:${port}`);
  console.log(`📖 Swagger UI   → http://localhost:${port}/docs`);
  console.log(`📄 OpenAPI JSON → http://localhost:${port}/docs-json`);
}
void bootstrap();
