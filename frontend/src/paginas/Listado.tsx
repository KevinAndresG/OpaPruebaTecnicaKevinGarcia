import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, type Credito, ESTADOS, type Meta, TIPOS } from "../api";
import { Estatus, fecha, moneda, NOMBRE_ESTADO } from "../ui";

export default function Listado() {
  const [params, setParams] = useSearchParams();
  const [busqueda, setBusqueda] = useState(params.get("q") ?? "");
  const [filas, setFilas] = useState<Credito[]>([]);
  const [meta, setMeta] = useState<Meta>();
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  const cambiar = (cambios: Record<string, string>) => {
    const p = new URLSearchParams(params);
    Object.entries({ page: "1", ...cambios }).forEach(([k, v]) =>
      v ? p.set(k, v) : p.delete(k),
    );
    setParams(p, { replace: true });
  };

  useEffect(() => {
    const t = setTimeout(
      () =>
        busqueda !== (params.get("q") ?? "")
          ? cambiar({ q: busqueda })
          : undefined,
      350,
    );
    return () => clearTimeout(t);
  }, [busqueda]); // eslint-disable-line react-hooks/exhaustive-deps

  const consulta = params.toString();
  useEffect(() => {
    setCargando(true);
    setError("");
    api
      .listar(new URLSearchParams(consulta))
      .then((r) => {
        setFilas(r.data);
        setMeta(r.meta);
      })
      .catch((e) => setError(e.message))
      .finally(() => setCargando(false));
  }, [consulta]);

  const pagina = Number(params.get("page") ?? 1);
  const orden = `${params.get("sort") ?? "fechaSolicitud"}:${
    params.get("order") ?? "desc"
  }`;

  return (
    <div className="listado">
      <header className="cabecera">
        <h1>Créditos</h1>
        <Link className="btn" to="/creditos/nuevo">
          Nueva solicitud
        </Link>
      </header>

      <div className="tarjeta filtros">
        <label>
          Buscar
          <input
            type="search"
            placeholder="Nombre, identificación o número"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </label>
        <label>
          Estado
          <select
            value={params.get("estado") ?? ""}
            onChange={(e) => cambiar({ estado: e.target.value })}
          >
            <option value="">Todos</option>
            {ESTADOS.map((e) => (
              <option key={e} value={e}>
                {NOMBRE_ESTADO[e]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Ordenar por
          <select
            value={orden}
            onChange={(e) => {
              const [sort, order] = e.target.value.split(":");
              cambiar({ sort, order });
            }}
          >
            <option value="fechaSolicitud:desc">Más recientes</option>
            <option value="fechaSolicitud:asc">Más antiguos</option>
            <option value="valorSolicitado:desc">Mayor valor</option>
            <option value="valorSolicitado:asc">Menor valor</option>
          </select>
        </label>
      </div>

      <div className="tarjeta tabla-card">
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {!error && !cargando && filas.length === 0 && (
          <p className="suave">
            No hay créditos que coincidan con los filtros.
          </p>
        )}
        {filas.length > 0 && (
          <div className="tabla-wrap" aria-busy={cargando}>
            <table>
              <thead>
                <tr>
                  <th>Crédito</th>
                  <th>Asociado</th>
                  <th>Tipo</th>
                  <th className="num">Valor</th>
                  <th>Estado</th>
                  <th>Fecha</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((c) => (
                  <tr key={c.id}>
                    <td data-label="Crédito">
                      <Link to={`/creditos/${c.id}`}>{c.numeroCredito}</Link>
                    </td>
                    <td data-label="Asociado">
                      <span>
                        {c.nombreAsociado}
                        <small>{c.identificacionAsociado}</small>
                      </span>
                    </td>
                    <td data-label="Tipo">{TIPOS[c.tipoCredito]}</td>
                    <td className="num" data-label="Valor">{moneda(c.valorSolicitado)}</td>
                    <td data-label="Estado">
                      <Estatus estado={c.estado} />
                    </td>
                    <td data-label="Fecha">{fecha(c.fechaSolicitud)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {cargando && filas.length === 0 && <p className="suave">Cargando…</p>}

        {meta && meta.total > 0 && (
          <div className="paginacion">
            <span className="suave">
              Total {meta.total} mostrando {filas.length} · página {meta.page}{" "}
              de {meta.totalPages}
            </span>
            <div>
              <button
                className="btn-sec"
                disabled={pagina <= 1}
                onClick={() => cambiar({ page: String(pagina - 1) })}
              >
                Anterior
              </button>
              <button
                className="btn-sec"
                disabled={pagina >= meta.totalPages}
                onClick={() => cambiar({ page: String(pagina + 1) })}
              >
                Siguiente
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
