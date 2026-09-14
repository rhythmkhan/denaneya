import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';

export interface RequestOptions {
  apiKey?: string;
  idempotencyKey?: string;
  headers?: Record<string, string>;
  params?: Record<string, string>;
  timeoutMs?: number;
}

export interface ApiResponse<T = any> {
  status: number;
  ok: boolean;
  data: T;
  headers: Record<string, string>;
  rawText: string;
}

export class ApiClient {
  private baseUrl: string;
  private defaultApiKey?: string;

  constructor(baseUrl: string = 'http://localhost:3000', defaultApiKey?: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.defaultApiKey = defaultApiKey;
  }

  public setDefaultApiKey(key: string) {
    this.defaultApiKey = key;
  }

  private buildHeaders(options?: RequestOptions, hasBody: boolean = false): Record<string, string> {
    const headers: Record<string, string> = {
      'x-request-id': 'req_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16),
      ...(options?.headers || {}),
    };

    const apiKey = options?.apiKey || this.defaultApiKey;
    if (apiKey && !headers['authorization'] && !headers['Authorization']) {
      headers['authorization'] = 'Bearer ' + apiKey;
    }

    if (options?.idempotencyKey) {
      headers['idempotency-key'] = options.idempotencyKey;
    }

    if (hasBody && !headers['content-type'] && !headers['Content-Type']) {
      headers['content-type'] = 'application/json';
    }

    return headers;
  }

  public async request<T = any>(
    method: string,
    path: string,
    body?: any,
    options?: RequestOptions
  ): Promise<ApiResponse<T>> {
    const url = new URL(path.startsWith('http') ? path : this.baseUrl + path);
    if (options?.params) {
      for (const [k, v] of Object.entries(options.params)) {
        url.searchParams.set(k, v);
      }
    }

    const headers = this.buildHeaders(options, body !== undefined);
    const reqInit: RequestInit = {
      method,
      headers,
    };
    if (body !== undefined) {
      reqInit.body = typeof body === 'string' ? body : JSON.stringify(body);
    }

    const response = await fetch(url.toString(), reqInit);
    const rawText = await response.text();
    let data: any;
    try {
      data = JSON.parse(rawText);
    } catch {
      data = rawText;
    }

    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((v, k) => {
      responseHeaders[k.toLowerCase()] = v;
    });

    return {
      status: response.status,
      ok: response.ok,
      data: data as T,
      headers: responseHeaders,
      rawText,
    };
  }

  public get<T = any>(path: string, options?: RequestOptions): Promise<ApiResponse<T>> {
    return this.request<T>('GET', path, undefined, options);
  }

  public post<T = any>(path: string, body?: any, options?: RequestOptions): Promise<ApiResponse<T>> {
    return this.request<T>('POST', path, body, options);
  }

  public put<T = any>(path: string, body?: any, options?: RequestOptions): Promise<ApiResponse<T>> {
    return this.request<T>('PUT', path, body, options);
  }

  public delete<T = any>(path: string, options?: RequestOptions): Promise<ApiResponse<T>> {
    return this.request<T>('DELETE', path, undefined, options);
  }

  public createNextRequest(method: string, path: string, body?: any, options?: RequestOptions): NextRequest {
    const url = path.startsWith('http') ? path : this.baseUrl + path;
    const headers = this.buildHeaders(options, body !== undefined);
    const init: RequestInit = {
      method,
      headers,
    };
    if (body !== undefined) {
      init.body = typeof body === 'string' ? body : JSON.stringify(body);
    }
    return new NextRequest(url, init);
  }
}

export const apiClient = new ApiClient();
