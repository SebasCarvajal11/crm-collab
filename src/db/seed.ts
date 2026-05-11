/**
 * Seed de desarrollo — crea proyectos, tareas y datos de prueba realistas.
 * Uso: npx tsx src/db/seed.ts
 * 
 * IMPORTANTE: Ejecutar primero el seed de mod-auth para obtener los subjects de usuarios.
 */
import "dotenv/config";
import { db } from "./connection";
import {
  projects,
  projectMembers,
  projectTaskColumns,
  projectTasks,
  projectChatMessages,
  projectBriefs,
  projectChangeRequests,
} from "./schema";
import { sql } from "drizzle-orm";

// Columnas por defecto para cada tipo de proyecto
const CAMPAIGN_COLUMNS = [
  { key: "pending" as const, title: "Pendiente", position: 0, isClientVisible: false },
  { key: "doing" as const, title: "En Proceso", position: 1, isClientVisible: false },
  { key: "internal_review" as const, title: "Revisión Interna", position: 2, isClientVisible: false },
  { key: "client_approval" as const, title: "Aprobación Cliente", position: 3, isClientVisible: true },
  { key: "blocked" as const, title: "Bloqueado", position: 4, isClientVisible: false },
  { key: "done" as const, title: "Completado", position: 5, isClientVisible: true },
];

const PRODUCT_COLUMNS = [
  { key: "pending" as const, title: "Pendiente", position: 0, isClientVisible: false },
  { key: "art_approved" as const, title: "Arte Aprobado", position: 1, isClientVisible: true },
  { key: "in_production" as const, title: "En Producción", position: 2, isClientVisible: true },
  { key: "quality_control" as const, title: "Control Calidad", position: 3, isClientVisible: false },
  { key: "waiting_material" as const, title: "Esperando Material", position: 4, isClientVisible: false },
  { key: "shipped" as const, title: "Enviado", position: 5, isClientVisible: true },
  { key: "completed" as const, title: "Entregado", position: 6, isClientVisible: true },
];

interface ProjectSeed {
  name: string;
  description: string;
  clientName: string;
  type: "campaign_service" | "product_order";
  status: "todo" | "in_progress" | "in_review" | "completed";
  progressPercent: number;
  brief: string;
  tasks: TaskSeed[];
  chatMessages: ChatMessageSeed[];
}

interface TaskSeed {
  columnKey: string;
  title: string;
  description: string;
  priority: "low" | "medium" | "high" | "urgent";
  isClientVisible: boolean;
  checklistProgress: number;
}

interface ChatMessageSeed {
  channel: "internal" | "external";
  body: string;
}

const PROJECTS_TO_SEED: ProjectSeed[] = [
  // Proyecto 1 - Campaña en progreso
  {
    name: "Campaña de Verano 2026",
    description: "Campaña publicitaria integral para la temporada de verano incluyendo redes sociales, vallas y medios digitales.",
    clientName: "Restaurante El Buen Sabor",
    type: "campaign_service",
    status: "in_progress",
    progressPercent: 65,
    brief: `# Brief: Campaña de Verano 2026

## Objetivo
Incrementar las ventas en un 30% durante la temporada de verano mediante una campaña multicanal.

## Público Objetivo
- Familias de clase media-alta
- Jóvenes profesionales (25-40 años)
- Turistas nacionales

## Canales
- Instagram, Facebook, TikTok
- Google Ads
- Vallas publicitarias (3 ubicaciones)
- Radio local

## Presupuesto
$15,000 USD

## Fechas clave
- Inicio: 1 de Junio 2026
- Fin: 31 de Agosto 2026`,
    tasks: [
      { columnKey: "done", title: "Investigación de mercado", description: "Análisis de competencia y tendencias del sector gastronómico", priority: "high", isClientVisible: true, checklistProgress: 100 },
      { columnKey: "done", title: "Diseño de identidad visual", description: "Creación de assets gráficos para la campaña", priority: "high", isClientVisible: true, checklistProgress: 100 },
      { columnKey: "client_approval", title: "Videos promocionales", description: "3 videos de 15 segundos para redes sociales", priority: "high", isClientVisible: true, checklistProgress: 80 },
      { columnKey: "doing", title: "Configuración de ads", description: "Setup de campañas en Meta Ads y Google Ads", priority: "medium", isClientVisible: false, checklistProgress: 50 },
      { columnKey: "doing", title: "Diseño de vallas", description: "Diseño de 3 vallas publicitarias formato exterior", priority: "medium", isClientVisible: false, checklistProgress: 30 },
      { columnKey: "pending", title: "Producción de jingles", description: "Jingle de 30 segundos para radio", priority: "low", isClientVisible: false, checklistProgress: 0 },
    ],
    chatMessages: [
      { channel: "external", body: "¡Hola! Estamos emocionados de comenzar esta campaña. Les comparto el primer borrador de los diseños." },
      { channel: "external", body: "Los colores están perfectos, pero ¿podríamos hacer el logo un poco más grande?" },
      { channel: "internal", body: "El cliente pidió ajustes en el tamaño del logo. Ana, ¿puedes revisarlo?" },
      { channel: "internal", body: "Listo, ya subí la versión corregida." },
      { channel: "external", body: "¡Perfecto! Aprobamos los diseños. Pueden continuar con los videos." },
    ],
  },

  // Proyecto 2 - Pedido de productos
  {
    name: "Merchandising Corporativo Tech",
    description: "Producción de artículos promocionales: camisetas, tazas, libretas y bolígrafos con branding.",
    clientName: "Tecnologías Avanzadas S.A.",
    type: "product_order",
    status: "in_progress",
    progressPercent: 45,
    brief: `# Brief: Merchandising Corporativo

## Productos solicitados
- 200 camisetas polo (tallas S-XL)
- 150 tazas cerámicas
- 300 libretas A5
- 500 bolígrafos metálicos

## Especificaciones
- Colores corporativos: Azul #0066CC y Gris #333333
- Logo en alta resolución proporcionado
- Empaque individual

## Entrega
- Fecha límite: 15 de Junio 2026
- Dirección: Av. Tecnología 1500, Oficina 401`,
    tasks: [
      { columnKey: "art_approved", title: "Arte para camisetas", description: "Diseño frontal y espalda para serigrafía", priority: "high", isClientVisible: true, checklistProgress: 100 },
      { columnKey: "in_production", title: "Producción de camisetas", description: "200 unidades en 4 tallas", priority: "high", isClientVisible: true, checklistProgress: 60 },
      { columnKey: "art_approved", title: "Arte para tazas", description: "Diseño para sublimación", priority: "medium", isClientVisible: true, checklistProgress: 100 },
      { columnKey: "quality_control", title: "Control de tazas", description: "Revisión de 150 unidades producidas", priority: "medium", isClientVisible: false, checklistProgress: 40 },
      { columnKey: "pending", title: "Producción de libretas", description: "300 libretas A5 con logo en pasta", priority: "medium", isClientVisible: false, checklistProgress: 0 },
      { columnKey: "pending", title: "Producción de bolígrafos", description: "500 bolígrafos con grabado láser", priority: "low", isClientVisible: false, checklistProgress: 0 },
    ],
    chatMessages: [
      { channel: "external", body: "Buenas tardes, adjunto los archivos de logo en formato vectorial." },
      { channel: "external", body: "¿Podrían enviar una muestra de la camiseta antes de la producción completa?" },
      { channel: "internal", body: "Necesitamos coordinar con producción para enviar muestra al cliente." },
      { channel: "external", body: "La muestra se ve excelente. Aprobamos la producción completa." },
    ],
  },

  // Proyecto 3 - Campaña completada
  {
    name: "Rebranding Moda Bella 2026",
    description: "Renovación completa de imagen corporativa incluyendo logo, papelería y manual de marca.",
    clientName: "Moda Bella Boutique",
    type: "campaign_service",
    status: "completed",
    progressPercent: 100,
    brief: `# Brief: Rebranding Completo

## Objetivo
Modernizar la imagen de marca para atraer público más joven sin perder la elegancia característica.

## Entregables
- Nuevo logotipo
- Paleta de colores
- Tipografía corporativa
- Papelería completa
- Manual de marca (60+ páginas)
- Templates para redes sociales`,
    tasks: [
      { columnKey: "done", title: "Investigación y moodboard", description: "Análisis de tendencias y referencias visuales", priority: "high", isClientVisible: true, checklistProgress: 100 },
      { columnKey: "done", title: "Propuestas de logo", description: "3 opciones de nuevo logotipo", priority: "high", isClientVisible: true, checklistProgress: 100 },
      { columnKey: "done", title: "Desarrollo de propuesta elegida", description: "Refinamiento del logo seleccionado", priority: "high", isClientVisible: true, checklistProgress: 100 },
      { columnKey: "done", title: "Diseño de papelería", description: "Tarjetas, hojas membretadas, sobres", priority: "medium", isClientVisible: true, checklistProgress: 100 },
      { columnKey: "done", title: "Manual de marca", description: "Documento completo de 65 páginas", priority: "high", isClientVisible: true, checklistProgress: 100 },
      { columnKey: "done", title: "Templates redes sociales", description: "20 templates editables para Instagram", priority: "medium", isClientVisible: true, checklistProgress: 100 },
    ],
    chatMessages: [
      { channel: "external", body: "Estamos muy satisfechos con el resultado final. ¡El nuevo logo es hermoso!" },
      { channel: "external", body: "El manual de marca es muy completo. Gracias por todo el trabajo." },
      { channel: "internal", body: "Proyecto cerrado exitosamente. Cliente muy satisfecho." },
    ],
  },

  // Proyecto 4 - En revisión
  {
    name: "Web App Constructora",
    description: "Diseño UI/UX y desarrollo frontend para aplicación web de gestión de proyectos de construcción.",
    clientName: "Constructora Sólida",
    type: "campaign_service",
    status: "in_review",
    progressPercent: 85,
    brief: `# Brief: Aplicación Web

## Funcionalidades principales
- Dashboard de proyectos
- Seguimiento de avance de obras
- Gestión de documentos
- Calendario de entregas
- Reportes automáticos

## Tecnologías
- React + TypeScript
- Diseño responsive
- PWA compatible`,
    tasks: [
      { columnKey: "done", title: "Wireframes", description: "Estructura de todas las pantallas principales", priority: "high", isClientVisible: true, checklistProgress: 100 },
      { columnKey: "done", title: "Diseño UI", description: "Diseño visual de alta fidelidad", priority: "high", isClientVisible: true, checklistProgress: 100 },
      { columnKey: "done", title: "Prototipo interactivo", description: "Prototipo navegable en Figma", priority: "medium", isClientVisible: true, checklistProgress: 100 },
      { columnKey: "client_approval", title: "Desarrollo frontend", description: "Implementación en React", priority: "high", isClientVisible: true, checklistProgress: 90 },
      { columnKey: "client_approval", title: "Testing y QA", description: "Pruebas de usabilidad y bugs", priority: "medium", isClientVisible: false, checklistProgress: 70 },
    ],
    chatMessages: [
      { channel: "external", body: "El prototipo está muy bien logrado. Solo tenemos algunos comentarios menores." },
      { channel: "internal", body: "Pedro, revisa los comentarios del cliente sobre el flujo de login." },
      { channel: "external", body: "Estamos revisando la versión final. Les confirmo mañana." },
    ],
  },

  // Proyecto 5 - Campaña médica
  {
    name: "Campaña Salud Preventiva",
    description: "Campaña de concientización sobre chequeos médicos preventivos para redes sociales y medios tradicionales.",
    clientName: "Clínica Salud 360",
    type: "campaign_service",
    status: "in_progress",
    progressPercent: 40,
    brief: `# Brief: Campaña de Salud

## Mensaje principal
"Tu salud no puede esperar" - Importancia de los chequeos preventivos anuales.

## Público
- Adultos 35-60 años
- Enfoque en hombres (menor tasa de chequeos)

## Medios
- Facebook e Instagram
- YouTube (videos educativos)
- Folletos para consultorios`,
    tasks: [
      { columnKey: "done", title: "Concepto creativo", description: "Desarrollo del concepto y mensajes clave", priority: "high", isClientVisible: true, checklistProgress: 100 },
      { columnKey: "doing", title: "Diseño de piezas gráficas", description: "Posts y stories para redes", priority: "high", isClientVisible: false, checklistProgress: 60 },
      { columnKey: "doing", title: "Guiones de video", description: "3 videos educativos de 2 minutos", priority: "medium", isClientVisible: false, checklistProgress: 40 },
      { columnKey: "pending", title: "Producción de videos", description: "Filmación y edición", priority: "high", isClientVisible: false, checklistProgress: 0 },
      { columnKey: "pending", title: "Diseño de folletos", description: "Folleto tríptico informativo", priority: "low", isClientVisible: false, checklistProgress: 0 },
    ],
    chatMessages: [
      { channel: "external", body: "El concepto creativo está aprobado. Pueden continuar con los diseños." },
      { channel: "internal", body: "Sofía está trabajando en las piezas gráficas. Entrega estimada: viernes." },
    ],
  },

  // Proyecto 6 - Gimnasio
  {
    name: "Identidad Visual Gym Power",
    description: "Creación de logotipo, uniformes para staff y señalética interior del gimnasio.",
    clientName: "Gimnasio Power Fitness",
    type: "campaign_service",
    status: "in_progress",
    progressPercent: 55,
    brief: `# Brief: Identidad Gimnasio

## Estilo deseado
- Dinámico y energético
- Colores: Negro, Naranja, Blanco
- Tipografía bold/deportiva

## Entregables
- Logo principal + variaciones
- Diseño de uniformes (2 opciones)
- Señalética interior (15 señales)`,
    tasks: [
      { columnKey: "done", title: "Propuestas de logo", description: "5 opciones iniciales de logotipo", priority: "high", isClientVisible: true, checklistProgress: 100 },
      { columnKey: "done", title: "Logo final", description: "Versión aprobada con variaciones", priority: "high", isClientVisible: true, checklistProgress: 100 },
      { columnKey: "client_approval", title: "Diseño de uniformes", description: "Camisetas y pants para staff", priority: "medium", isClientVisible: true, checklistProgress: 80 },
      { columnKey: "doing", title: "Señalética interior", description: "Diseño de 15 señales", priority: "medium", isClientVisible: false, checklistProgress: 40 },
      { columnKey: "pending", title: "Manual de uso de marca", description: "Guía de aplicación del logo", priority: "low", isClientVisible: false, checklistProgress: 0 },
    ],
    chatMessages: [
      { channel: "external", body: "¡El logo quedó increíble! Exactamente lo que buscábamos." },
      { channel: "external", body: "Para los uniformes, preferimos la opción B con el logo más pequeño." },
      { channel: "internal", body: "Diego, ajusta el tamaño del logo en la opción B de uniformes." },
    ],
  },

  // Proyecto 7 - Cafetería
  {
    name: "Menú y Packaging Aroma",
    description: "Diseño de menú físico y digital, más packaging para productos para llevar.",
    clientName: "Cafetería Aroma",
    type: "product_order",
    status: "todo",
    progressPercent: 0,
    brief: `# Brief: Menú y Packaging

## Menú
- Formato A4 plastificado
- Versión digital para QR
- Fotografía de productos incluida

## Packaging
- Vasos de café (3 tamaños)
- Bolsas de papel
- Cajas para pasteles
- Stickers de cierre`,
    tasks: [
      { columnKey: "pending", title: "Sesión fotográfica", description: "Fotografía de productos del menú", priority: "high", isClientVisible: false, checklistProgress: 0 },
      { columnKey: "pending", title: "Diseño de menú físico", description: "Layout A4 doble cara", priority: "high", isClientVisible: false, checklistProgress: 0 },
      { columnKey: "pending", title: "Menú digital", description: "Versión web responsive", priority: "medium", isClientVisible: false, checklistProgress: 0 },
      { columnKey: "pending", title: "Diseño de vasos", description: "3 tamaños con branding", priority: "medium", isClientVisible: false, checklistProgress: 0 },
      { columnKey: "pending", title: "Diseño de bolsas", description: "Bolsa kraft con logo", priority: "low", isClientVisible: false, checklistProgress: 0 },
    ],
    chatMessages: [
      { channel: "external", body: "Hola, estamos listos para iniciar el proyecto. ¿Cuándo podemos agendar la sesión de fotos?" },
    ],
  },

  // Proyecto 8 - Automotriz
  {
    name: "Campaña Lanzamiento SUV 2027",
    description: "Campaña de expectativa y lanzamiento para nuevo modelo SUV.",
    clientName: "Automotriz Rápido",
    type: "campaign_service",
    status: "in_progress",
    progressPercent: 30,
    brief: `# Brief: Lanzamiento Vehículo

## Fases
1. Teaser (2 semanas)
2. Reveal (evento + digital)
3. Mantenimiento (1 mes)

## Canales
- TV nacional
- Redes sociales
- Vallas autopistas
- Evento de lanzamiento`,
    tasks: [
      { columnKey: "done", title: "Estrategia de campaña", description: "Plan de medios y cronograma", priority: "urgent", isClientVisible: true, checklistProgress: 100 },
      { columnKey: "doing", title: "Piezas teaser", description: "Videos y gráficos de expectativa", priority: "urgent", isClientVisible: false, checklistProgress: 50 },
      { columnKey: "doing", title: "Spot de TV", description: "Comercial de 30 segundos", priority: "urgent", isClientVisible: false, checklistProgress: 20 },
      { columnKey: "pending", title: "Producción evento", description: "Coordinación de evento reveal", priority: "high", isClientVisible: false, checklistProgress: 0 },
      { columnKey: "pending", title: "Vallas publicitarias", description: "Diseño para 10 ubicaciones", priority: "medium", isClientVisible: false, checklistProgress: 0 },
    ],
    chatMessages: [
      { channel: "external", body: "Es urgente mantener la confidencialidad del diseño del vehículo hasta el reveal." },
      { channel: "internal", body: "Equipo, este proyecto tiene NDA. No compartir ningún material externamente." },
      { channel: "external", body: "Necesitamos ver avances del teaser esta semana." },
    ],
  },

  // Proyecto 9 - Academia
  {
    name: "Portal Educativo Online",
    description: "Diseño de plataforma e-learning con cursos interactivos y certificaciones.",
    clientName: "Academia Éxito",
    type: "campaign_service",
    status: "in_progress",
    progressPercent: 70,
    brief: `# Brief: Plataforma E-Learning

## Funcionalidades
- Catálogo de cursos
- Reproductor de video
- Evaluaciones
- Certificados automáticos
- Dashboard de estudiante

## Integraciones
- Pasarela de pago
- Zoom para clases en vivo`,
    tasks: [
      { columnKey: "done", title: "Arquitectura de información", description: "Estructura de navegación", priority: "high", isClientVisible: true, checklistProgress: 100 },
      { columnKey: "done", title: "Diseño de UI", description: "Todas las pantallas principales", priority: "high", isClientVisible: true, checklistProgress: 100 },
      { columnKey: "done", title: "Frontend estudiantes", description: "Portal de estudiantes", priority: "high", isClientVisible: true, checklistProgress: 100 },
      { columnKey: "client_approval", title: "Frontend admin", description: "Panel de administración", priority: "high", isClientVisible: true, checklistProgress: 85 },
      { columnKey: "doing", title: "Integración de pagos", description: "Conexión con pasarela", priority: "medium", isClientVisible: false, checklistProgress: 60 },
      { columnKey: "pending", title: "Testing final", description: "QA completo de la plataforma", priority: "high", isClientVisible: false, checklistProgress: 0 },
    ],
    chatMessages: [
      { channel: "external", body: "El portal de estudiantes está muy bien. Procedemos con el panel admin." },
      { channel: "internal", body: "Laura, necesitamos terminar la integración de pagos antes del viernes." },
      { channel: "external", body: "¿Cuándo podemos hacer las pruebas finales?" },
    ],
  },

  // Proyecto 10 - Joyería
  {
    name: "Catálogo Navidad 2026",
    description: "Catálogo impreso y digital de colección navideña de joyería.",
    clientName: "Joyería Plata & Oro",
    type: "campaign_service",
    status: "in_review",
    progressPercent: 90,
    brief: `# Brief: Catálogo Navideño

## Especificaciones
- 32 páginas
- Fotografía de alta gama
- Versión impresa y PDF interactivo
- Tiraje: 1,000 ejemplares`,
    tasks: [
      { columnKey: "done", title: "Sesión fotográfica", description: "Fotografía de 45 piezas", priority: "high", isClientVisible: true, checklistProgress: 100 },
      { columnKey: "done", title: "Retoque fotográfico", description: "Edición profesional de imágenes", priority: "high", isClientVisible: true, checklistProgress: 100 },
      { columnKey: "done", title: "Diseño editorial", description: "Layout de 32 páginas", priority: "high", isClientVisible: true, checklistProgress: 100 },
      { columnKey: "client_approval", title: "Versión final impresa", description: "PDF listo para imprenta", priority: "high", isClientVisible: true, checklistProgress: 95 },
      { columnKey: "client_approval", title: "Catálogo digital", description: "PDF interactivo con enlaces", priority: "medium", isClientVisible: true, checklistProgress: 90 },
    ],
    chatMessages: [
      { channel: "external", body: "Las fotos quedaron espectaculares. El equipo está muy contento." },
      { channel: "external", body: "Solo un pequeño ajuste en la página 15, el precio está incorrecto." },
      { channel: "internal", body: "Corregir precio en página 15 y enviar versión final." },
    ],
  },

  // Proyecto 11 - Hotel
  {
    name: "Señalización Hotel Paraíso",
    description: "Sistema de señalética interior y exterior para hotel 5 estrellas.",
    clientName: "Hotel Paraíso",
    type: "product_order",
    status: "in_progress",
    progressPercent: 50,
    brief: `# Brief: Señalética Hotelera

## Elementos
- Directorio principal lobby
- Señales de habitaciones (200)
- Señalética exterior
- Emergencia y evacuación
- Áreas comunes (restaurante, spa, gym, pool)`,
    tasks: [
      { columnKey: "done", title: "Relevamiento in situ", description: "Visita y mediciones", priority: "high", isClientVisible: true, checklistProgress: 100 },
      { columnKey: "art_approved", title: "Diseño de sistema", description: "Familia de señales", priority: "high", isClientVisible: true, checklistProgress: 100 },
      { columnKey: "in_production", title: "Señales de habitaciones", description: "200 unidades acrílico", priority: "high", isClientVisible: true, checklistProgress: 40 },
      { columnKey: "waiting_material", title: "Directorio lobby", description: "Estructura metálica iluminada", priority: "medium", isClientVisible: false, checklistProgress: 20 },
      { columnKey: "pending", title: "Señales de emergencia", description: "Fotoluminiscentes normativa", priority: "high", isClientVisible: false, checklistProgress: 0 },
      { columnKey: "pending", title: "Instalación", description: "Colocación de todas las señales", priority: "medium", isClientVisible: false, checklistProgress: 0 },
    ],
    chatMessages: [
      { channel: "external", body: "El diseño del sistema de señales está aprobado. Pueden iniciar producción." },
      { channel: "internal", body: "Hay retraso en el material para el directorio del lobby. ETA: 2 semanas." },
      { channel: "external", body: "¿Cuál es el estado de la producción de las señales de habitaciones?" },
    ],
  },

  // Proyecto 12 - Deportes
  {
    name: "Tienda Online Deportes",
    description: "E-commerce completo para venta de equipamiento deportivo.",
    clientName: "Deportes Extreme",
    type: "campaign_service",
    status: "todo",
    progressPercent: 0,
    brief: `# Brief: E-commerce Deportivo

## Requerimientos
- Catálogo de 500+ productos
- Carrito de compras
- Múltiples métodos de pago
- Integración con inventario
- App móvil futura

## Tecnología
- Shopify Plus
- Diseño personalizado`,
    tasks: [
      { columnKey: "pending", title: "Benchmarking", description: "Análisis de competidores", priority: "medium", isClientVisible: false, checklistProgress: 0 },
      { columnKey: "pending", title: "Wireframes", description: "Estructura de tienda", priority: "high", isClientVisible: false, checklistProgress: 0 },
      { columnKey: "pending", title: "Diseño UI", description: "Look & feel de la tienda", priority: "high", isClientVisible: false, checklistProgress: 0 },
      { columnKey: "pending", title: "Desarrollo Shopify", description: "Implementación de tema", priority: "high", isClientVisible: false, checklistProgress: 0 },
      { columnKey: "pending", title: "Carga de productos", description: "500 productos con fotos", priority: "medium", isClientVisible: false, checklistProgress: 0 },
      { columnKey: "pending", title: "Testing y lanzamiento", description: "QA y go-live", priority: "high", isClientVisible: false, checklistProgress: 0 },
    ],
    chatMessages: [
      { channel: "external", body: "Hola, queremos iniciar el proyecto lo antes posible. ¿Cuál es el siguiente paso?" },
    ],
  },
];

async function seed() {
  console.log("🌱 Iniciando seed de mod-collab...\n");

  // Primero, obtener usuarios de la base de datos de auth
  // Como no tenemos acceso directo, usaremos UUIDs ficticios que representan a los usuarios
  // En producción, esto debería sincronizarse con mod-auth
  
  // Obtener el admin actual de mod-auth mediante query directa
  const authAdminResult = await db.execute(sql`
    SELECT subject FROM schema_auth.users WHERE role = 'admin' LIMIT 1
  `);
  
  const authWorkersResult = await db.execute(sql`
    SELECT subject FROM schema_auth.users WHERE role = 'worker'
  `);
  
  const authClientsResult = await db.execute(sql`
    SELECT subject, email FROM schema_auth.users WHERE role = 'client'
  `);

  const adminSub = (authAdminResult.rows[0] as any)?.subject;
  const workerSubs = (authWorkersResult.rows as any[]).map((r) => r.subject);
  const clientData = (authClientsResult.rows as any[]).map((r) => ({ subject: r.subject, email: r.email }));

  if (!adminSub) {
    console.error("❌ No se encontró un admin en schema_auth.users. Ejecuta primero: npm run db:seed en mod-auth");
    process.exit(1);
  }

  console.log(`📋 Admin encontrado: ${adminSub}`);
  console.log(`👷 Workers encontrados: ${workerSubs.length}`);
  console.log(`👤 Clientes encontrados: ${clientData.length}\n`);

  // Mapeo de clientes por nombre
  const clientMap: Record<string, string> = {};
  for (const client of clientData) {
    // Extraer nombre del email para mapeo
    const emailPart = client.email.split("@")[0];
    clientMap[emailPart] = client.subject;
  }

  let projectsCreated = 0;
  let tasksCreated = 0;
  let messagesCreated = 0;

  for (let i = 0; i < PROJECTS_TO_SEED.length; i++) {
    const projectSeed = PROJECTS_TO_SEED[i];
    
    // Buscar el subject del cliente por nombre parcial
    let clientSub: string | null = null;
    for (const [key, sub] of Object.entries(clientMap)) {
      if (projectSeed.clientName.toLowerCase().includes(key.split("@")[0].toLowerCase())) {
        clientSub = sub;
        break;
      }
    }

    // Asignar worker responsable (round-robin)
    const responsibleWorker = workerSubs.length > 0 ? workerSubs[i % workerSubs.length] : adminSub;

    try {
      // Crear proyecto
      const [project] = await db
        .insert(projects)
        .values({
          name: projectSeed.name,
          description: projectSeed.description,
          clientName: projectSeed.clientName,
          clientSub,
          type: projectSeed.type,
          status: projectSeed.status,
          progressPercent: projectSeed.progressPercent,
          adminResponsibleSub: adminSub,
        })
        .returning();

      projectsCreated++;
      console.log(`✅ Proyecto: ${project.name}`);

      // Agregar admin como miembro
      await db.insert(projectMembers).values({
        projectId: project.id,
        userSub: adminSub,
        role: "admin",
      });

      // Agregar worker como miembro
      if (responsibleWorker !== adminSub) {
        await db.insert(projectMembers).values({
          projectId: project.id,
          userSub: responsibleWorker,
          role: "worker",
        });
      }

      // Agregar cliente como miembro si existe
      if (clientSub) {
        await db.insert(projectMembers).values({
          projectId: project.id,
          userSub: clientSub,
          role: "client",
        });
      }

      // Crear columnas según tipo de proyecto
      const columnsConfig = projectSeed.type === "campaign_service" ? CAMPAIGN_COLUMNS : PRODUCT_COLUMNS;
      const createdColumns: Array<{ id: string; key: string }> = [];

      for (const col of columnsConfig) {
        const [column] = await db
          .insert(projectTaskColumns)
          .values({
            projectId: project.id,
            key: col.key,
            title: col.title,
            position: col.position,
            isClientVisible: col.isClientVisible,
            isDefault: true,
          })
          .returning();
        createdColumns.push({ id: column.id, key: column.key });
      }

      // Crear tareas
      for (let taskIdx = 0; taskIdx < projectSeed.tasks.length; taskIdx++) {
        const taskSeed = projectSeed.tasks[taskIdx];
        const targetColumn = createdColumns.find((c) => c.key === taskSeed.columnKey);
        
        if (!targetColumn) {
          console.warn(`   ⚠️ Columna no encontrada: ${taskSeed.columnKey}`);
          continue;
        }

        // Asignar a un worker aleatorio
        const assignee = workerSubs.length > 0 ? workerSubs[(i + taskIdx) % workerSubs.length] : null;

        await db.insert(projectTasks).values({
          projectId: project.id,
          columnId: targetColumn.id,
          title: taskSeed.title,
          description: taskSeed.description,
          priority: taskSeed.priority,
          assigneeSub: assignee,
          reporterSub: adminSub,
          isClientVisible: taskSeed.isClientVisible,
          checklistProgress: taskSeed.checklistProgress,
          position: taskIdx,
        });
        tasksCreated++;
      }

      // Crear mensajes de chat
      for (const msgSeed of projectSeed.chatMessages) {
        const authorSub = msgSeed.channel === "external" 
          ? (Math.random() > 0.5 ? clientSub : adminSub)
          : (Math.random() > 0.5 ? responsibleWorker : adminSub);

        await db.insert(projectChatMessages).values({
          projectId: project.id,
          channel: msgSeed.channel,
          messageType: "text",
          authorSub: authorSub || adminSub,
          body: msgSeed.body,
          mentionedSubs: [],
        });
        messagesCreated++;
      }

      // Crear brief
      await db.insert(projectBriefs).values({
        projectId: project.id,
        content: projectSeed.brief,
        updatedBySub: adminSub,
      });

    } catch (error: any) {
      if (error.message?.includes("duplicate key")) {
        console.log(`⏭️  Ya existe: ${projectSeed.name}`);
      } else {
        console.error(`❌ Error creando ${projectSeed.name}:`, error.message);
      }
    }
  }

  console.log("\n📊 Resumen:");
  console.log(`   Proyectos creados: ${projectsCreated}`);
  console.log(`   Tareas creadas: ${tasksCreated}`);
  console.log(`   Mensajes creados: ${messagesCreated}`);

  console.log("\n✨ Seed completado!");
  process.exit(0);
}

seed().catch((err) => {
  console.error("❌ Error en seed:", err);
  process.exit(1);
});
