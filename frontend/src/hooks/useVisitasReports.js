import { useState, useEffect, useRef, useCallback } from 'react';
import api from '../utils/api';

const buildParams = (filters = {}) => {
  const params = {};
  if (filters.branch && filters.branch !== 'all') params.branch = filters.branch;
  if (filters.date_from) params.date_from = filters.date_from;
  if (filters.date_to) params.date_to = filters.date_to;
  return params;
};

const useReport = (apiFn, filters, defaultData) => {
  const [data, setData] = useState(defaultData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const cancelledRef = useRef(false);

  const params = buildParams(filters);
  const filterKey = JSON.stringify(params);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFn(params);
      if (!cancelledRef.current) {
        setData(res.data);
      }
    } catch (err) {
      if (!cancelledRef.current) {
        setError(err?.response?.data?.detail || err.message || 'Erro ao carregar relatório');
      }
    } finally {
      if (!cancelledRef.current) {
        setLoading(false);
      }
    }
  }, [filterKey]);

  useEffect(() => {
    cancelledRef.current = false;
    fetchData();
    return () => {
      cancelledRef.current = true;
    };
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
};

export const useVisitasReportByVendedor = (filters) =>
  useReport(api.getVisitasReportByVendedor, filters, []);

export const useVisitasReportByFilial = (filters) =>
  useReport(api.getVisitasReportByFilial, filters, []);

export const useVisitasReportByAprovacao = (filters) =>
  useReport(api.getVisitasReportByAprovacao, filters, []);

export const useVisitasReportByDificuldade = (filters) =>
  useReport(api.getVisitasReportByDificuldade, filters, []);

export const useVisitasReportByTipoServico = (filters) =>
  useReport(api.getVisitasReportByTipoServico, filters, []);

export const useVisitasReportByAltura = (filters) =>
  useReport(api.getVisitasReportByAltura, filters, []);

export const useVisitasReportDivergenciaRemocao = (filters) =>
  useReport(api.getVisitasReportDivergenciaRemocao, filters, {
    divergencias: 0,
    total: 0,
    percentual_divergencia: 0,
    lista_divergencias: [],
  });

export const useVisitasReportCustoDeslocamento = (filters) =>
  useReport(api.getVisitasReportCustoDeslocamento, filters, []);

export const useVisitasReportByInstalador = (filters) =>
  useReport(api.getVisitasReportByInstalador, filters, []);
