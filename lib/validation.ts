import { z } from 'zod';
import { Ponto } from './store';

export const routePointSchema = z.object({
  numPonto: z
    .number()
    .int('numPonto deve ser um número inteiro.')
    .min(1, 'numPonto deve ser maior ou igual a 1.'),
  lat: z
    .number()
    .min(-90, 'lat deve estar entre -90 e 90.')
    .max(90, 'lat deve estar entre -90 e 90.'),
  lng: z
    .number()
    .min(-180, 'lng deve estar entre -180 e 180.')
    .max(180, 'lng deve estar entre -180 e 180.'),
});

export const routeSchema = z
  .array(routePointSchema)
  .min(1, 'Forneça ao menos um ponto de rota.');

export function validateAndNormalizeRoute(input: unknown): { pontos: Ponto[] } {
  const parseResult = routeSchema.safeParse(input);

  if (!parseResult.success) {
    const errors: string[] = [];
    parseResult.error.errors.forEach((err) => {
      if (err.path.length === 0) {
        errors.push(err.message);
      } else if (err.path.length === 1 && typeof err.path[0] === 'number') {
        errors.push(`Ponto ${err.path[0] + 1}: ${err.message}`);
      } else {
        const field = err.path[err.path.length - 1];
        const index = err.path.length > 1 ? err.path[0] : null;
        if (typeof index === 'number') {
          errors.push(`Ponto ${index + 1}, campo '${field}': ${err.message}`);
        } else {
          errors.push(`Campo '${field}': ${err.message}`);
        }
      }
    });
    throw new Error(errors.join('\n'));
  }

  const pontos = parseResult.data.map((p) => ({
    numPonto: Number(p.numPonto),
    lat: Number(p.lat),
    lng: Number(p.lng),
  }));

  const numPontoSet = new Set<number>();
  for (const ponto of pontos) {
    if (numPontoSet.has(ponto.numPonto)) {
      throw new Error(`numPonto duplicado: ${ponto.numPonto}.`);
    }
    numPontoSet.add(ponto.numPonto);
  }

  pontos.sort((a, b) => a.numPonto - b.numPonto);

  for (let i = 0; i < pontos.length; i++) {
    const expectedNum = i + 1;
    if (pontos[i].numPonto !== expectedNum) {
      throw new Error(
        `Sequência inválida de numPonto (use 1,2,3…). Esperado ${expectedNum}, encontrado ${pontos[i].numPonto}.`
      );
    }
  }

  return { pontos };
}
