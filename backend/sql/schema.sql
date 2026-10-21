
IF DB_ID('OpaCreditos') IS NULL CREATE DATABASE OpaCreditos;
GO
USE OpaCreditos;
GO

IF OBJECT_ID('dbo.Asociados') IS NULL
CREATE TABLE dbo.Asociados (
    Id             INT IDENTITY(1,1) CONSTRAINT PK_Asociados PRIMARY KEY,
    Identificacion VARCHAR(15)   NOT NULL CONSTRAINT UQ_Asociados_Identificacion UNIQUE,
    Nombre         NVARCHAR(150) NOT NULL,
    FechaCreacion  DATETIME2(0)  NOT NULL CONSTRAINT DF_Asociados_Fecha DEFAULT SYSUTCDATETIME()
);
GO

IF OBJECT_ID('dbo.SeqNumeroCredito') IS NULL CREATE SEQUENCE dbo.SeqNumeroCredito START WITH 1 INCREMENT BY 1;
GO

IF OBJECT_ID('dbo.Creditos') IS NULL
CREATE TABLE dbo.Creditos (
    Id                 INT IDENTITY(1,1) CONSTRAINT PK_Creditos PRIMARY KEY,
    NumeroCredito      VARCHAR(20)   NOT NULL CONSTRAINT UQ_Creditos_Numero UNIQUE,
    AsociadoId         INT           NOT NULL CONSTRAINT FK_Creditos_Asociados REFERENCES dbo.Asociados(Id),
    TipoCredito        VARCHAR(30)   NOT NULL,
    -- dinero siempre en DECIMAL
    ValorSolicitado    DECIMAL(18,2) NOT NULL CONSTRAINT CK_Creditos_Valor  CHECK (ValorSolicitado > 0),
    TasaInteres        DECIMAL(5,2)  NOT NULL CONSTRAINT CK_Creditos_Tasa   CHECK (TasaInteres >= 0),
    NumeroCuotas       INT           NOT NULL CONSTRAINT CK_Creditos_Cuotas CHECK (NumeroCuotas > 0),
    FormaPago          VARCHAR(30)   NOT NULL,
    Estado             VARCHAR(20)   NOT NULL CONSTRAINT DF_Creditos_Estado DEFAULT 'SOLICITADO'
                       CONSTRAINT CK_Creditos_Estado CHECK (Estado IN ('SOLICITADO','EN_ESTUDIO','APROBADO','RECHAZADO','DESEMBOLSADO','CANCELADO')),
    FechaSolicitud     DATETIME2(0)  NOT NULL CONSTRAINT DF_Creditos_FechaSol DEFAULT SYSUTCDATETIME(),
    FechaActualizacion DATETIME2(0)  NOT NULL CONSTRAINT DF_Creditos_FechaAct DEFAULT SYSUTCDATETIME(),
    Eliminado          BIT           NOT NULL CONSTRAINT DF_Creditos_Eliminado DEFAULT 0   -- borrado lógico
);
GO

-- un asociado no puede tener dos créditos activos del mismo tipo
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_Creditos_Activo' AND object_id = OBJECT_ID('dbo.Creditos'))
    CREATE UNIQUE INDEX UX_Creditos_Activo ON dbo.Creditos (AsociadoId, TipoCredito)
    WHERE Estado IN ('SOLICITADO','EN_ESTUDIO','APROBADO') AND Eliminado = 0;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Creditos_Estado_Fecha' AND object_id = OBJECT_ID('dbo.Creditos'))
    CREATE INDEX IX_Creditos_Estado_Fecha ON dbo.Creditos (Estado, FechaSolicitud DESC) WHERE Eliminado = 0;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Creditos_Asociado' AND object_id = OBJECT_ID('dbo.Creditos'))
    CREATE INDEX IX_Creditos_Asociado ON dbo.Creditos (AsociadoId);
GO

IF OBJECT_ID('dbo.HistorialCredito') IS NULL
CREATE TABLE dbo.HistorialCredito (
    Id             INT IDENTITY(1,1) CONSTRAINT PK_Historial PRIMARY KEY,
    CreditoId      INT           NOT NULL CONSTRAINT FK_Historial_Creditos REFERENCES dbo.Creditos(Id),
    EstadoAnterior VARCHAR(20)   NULL,
    EstadoNuevo    VARCHAR(20)   NOT NULL,
    Usuario        VARCHAR(50)   NOT NULL,
    Observacion    NVARCHAR(500) NULL,
    Fecha          DATETIME2(0)  NOT NULL CONSTRAINT DF_Historial_Fecha DEFAULT SYSUTCDATETIME()
);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Historial_Credito' AND object_id = OBJECT_ID('dbo.HistorialCredito'))
    CREATE INDEX IX_Historial_Credito ON dbo.HistorialCredito (CreditoId, Fecha);
GO

-- cola de webhooks: se guarda junto al crédito y se envía aparte
IF OBJECT_ID('dbo.WebhookEventos') IS NULL
CREATE TABLE dbo.WebhookEventos (
    Id               INT IDENTITY(1,1) CONSTRAINT PK_WebhookEventos PRIMARY KEY,
    EventId          UNIQUEIDENTIFIER NOT NULL CONSTRAINT UQ_Webhook_EventId UNIQUE,
    CreditoId        INT           NOT NULL CONSTRAINT FK_Webhook_Creditos REFERENCES dbo.Creditos(Id),
    Evento           VARCHAR(50)   NOT NULL,
    Payload          NVARCHAR(MAX) NOT NULL,
    Estado           VARCHAR(10)   NOT NULL CONSTRAINT DF_Webhook_Estado DEFAULT 'PENDIENTE'
                     CONSTRAINT CK_Webhook_Estado CHECK (Estado IN ('PENDIENTE','ENVIADO','FALLIDO')),
    Intentos         INT           NOT NULL CONSTRAINT DF_Webhook_Intentos DEFAULT 0,
    ProximoIntento   DATETIME2(0)  NOT NULL CONSTRAINT DF_Webhook_Proximo DEFAULT SYSUTCDATETIME(),
    UltimoCodigoHttp INT           NULL,
    UltimoError      NVARCHAR(500) NULL,
    FechaCreacion    DATETIME2(0)  NOT NULL CONSTRAINT DF_Webhook_Fecha DEFAULT SYSUTCDATETIME(),
    FechaEnvio       DATETIME2(0)  NULL
);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Webhook_Pendientes' AND object_id = OBJECT_ID('dbo.WebhookEventos'))
    CREATE INDEX IX_Webhook_Pendientes ON dbo.WebhookEventos (ProximoIntento) WHERE Estado = 'PENDIENTE';
GO

IF OBJECT_ID('dbo.Usuarios') IS NULL
CREATE TABLE dbo.Usuarios (
    Id           INT IDENTITY(1,1) CONSTRAINT PK_Usuarios PRIMARY KEY,
    Username     VARCHAR(50)  NOT NULL CONSTRAINT UQ_Usuarios_Username UNIQUE,
    PasswordHash VARCHAR(100) NOT NULL,
    Rol          VARCHAR(20)  NOT NULL CONSTRAINT CK_Usuarios_Rol CHECK (Rol IN ('ADMIN','ANALISTA'))
);
GO
