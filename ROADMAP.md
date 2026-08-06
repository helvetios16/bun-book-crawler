# Bukcraw Roadmap & Sugerencias de Mejora

Este documento detalla las posibles evoluciones técnicas y funcionales para el proyecto **Bukcraw**.

## 1. Refactorización Arquitectónica
*   [x] **Separación de Concernimientos:** Mover la lógica de negocio de `pipeline.ts` a un `PipelineService` dedicado en `src/services/`.
*   [x] **Modularización de Servicios:** Dividir `GoodreadsService` en servicios especializados por dominio (`BookService`, `EditionService`, `BlogService`).
*   [x] **Validación Robusta:** Implementar **Zod** para validar las estructuras de datos extraídas de Goodreads (`__NEXT_DATA__`), asegurando integridad ante cambios en la plataforma.

## 2. Optimizaciones de Rendimiento
*   [x] **Concurrency Adaptativa:** Implementar un sistema de throttling inteligente que ajuste la concurrencia de `pMap` basándose en la tasa de éxito de las peticiones (detección de 429).
*   [ ] **Pool de Navegadores:** Gestionar un pool de páginas de Puppeteer para reducir el overhead de apertura/cierre del navegador en procesos largos.
*   [ ] **Mantenimiento de DB:** Añadir comandos para optimizar la base de datos SQLite (`VACUUM`, `ANALYZE`) y asegurar índices eficientes para consultas de relaciones complejas.

## 3. Nuevas Funcionalidades (Objetivos)
*   [ ] **Interfaz Web Local:** Crear un comando `bukcraw ui` para levantar un servidor ligero que permita explorar la base de datos y los reportes de forma visual.
*   [ ] **Sistema de Watch/Monitoreo:** Permitir el seguimiento de blogs específicos para automatizar el scraping cuando se detecten nuevas publicaciones.
*   [ ] **Formatos de Exportación:** Soporte para exportar reportes a **CSV** y **Excel** para facilitar el análisis externo.
*   [ ] **Fuentes de Respaldo:** Integración con **OpenLibrary** o **Google Books API** para completar metadatos de ediciones no encontradas en Goodreads.

## 4. Estabilidad y Experiencia de Usuario (DX)
*   [ ] **Rotación de Identidad:** Implementar rotación de `User-Agents` y soporte para proxies para minimizar el riesgo de bloqueos.
*   [ ] **Logs Persistentes:** Almacenar errores de scraping en una tabla de la base de datos para auditoría y reintento automático.
*   [ ] **Configuración de Usuario:** Soporte para un archivo `bukcraw.config.json` donde definir preferencias por defecto (`language`, `formats`, `output`).
*   [ ] **Tests de Integración:** Añadir pruebas que validen el flujo completo del CLI (`run`, `check`, `report`) usando mocks de red.
