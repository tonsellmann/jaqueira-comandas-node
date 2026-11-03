// O cardápio da Jaqueira Cozinha Baiana (restaurante fictício de Ilhéus), o mesmo do site.
// Cada item diz para qual estação vai (cozinha ou bar), em que etapa da refeição entra e quanto
// tempo leva para ficar pronto.

export type Estacao = 'cozinha' | 'bar';
export type Etapa = 'entrada' | 'principal' | 'sobremesa' | 'bebida';

export interface ItemDoCardapio {
  id: string;
  nome: string;
  /** Centavos. */
  preco: number;
  estacao: Estacao;
  etapa: Etapa;
  /** Minutos que o preparo costuma levar. */
  preparo: number;
}

export const ETAPAS: Etapa[] = ['entrada', 'principal', 'sobremesa', 'bebida'];
export const NOME_DA_ETAPA: Record<Etapa, string> = { entrada: 'Entradas', principal: 'Principais', sobremesa: 'Sobremesas', bebida: 'Bebidas' };

export const CARDAPIO: ItemDoCardapio[] = [
  { id: 'abara', nome: 'Abará', preco: 1600, estacao: 'cozinha', etapa: 'entrada', preparo: 8 },
  { id: 'casquinha', nome: 'Casquinha de siri', preco: 3200, estacao: 'cozinha', etapa: 'entrada', preparo: 12 },
  { id: 'bolinho', nome: 'Bolinho de aipim com carne do sol', preco: 3600, estacao: 'cozinha', etapa: 'entrada', preparo: 12 },
  { id: 'moqueca-camarao', nome: 'Moqueca de camarão', preco: 14800, estacao: 'cozinha', etapa: 'principal', preparo: 30 },
  { id: 'moqueca-mista', nome: 'Moqueca mista', preco: 15800, estacao: 'cozinha', etapa: 'principal', preparo: 30 },
  { id: 'moqueca-banana', nome: 'Moqueca de banana-da-terra', preco: 9800, estacao: 'cozinha', etapa: 'principal', preparo: 25 },
  { id: 'bobo', nome: 'Bobó de camarão', preco: 13200, estacao: 'cozinha', etapa: 'principal', preparo: 25 },
  { id: 'peixe-frito', nome: 'Peixe frito com pirão', preco: 8900, estacao: 'cozinha', etapa: 'principal', preparo: 25 },
  { id: 'carne-do-sol', nome: 'Carne do sol com aipim', preco: 8900, estacao: 'cozinha', etapa: 'principal', preparo: 20 },
  { id: 'xinxim', nome: 'Xinxim de galinha', preco: 7600, estacao: 'cozinha', etapa: 'principal', preparo: 25 },
  { id: 'mousse', nome: 'Mousse de cacau de Ilhéus', preco: 2400, estacao: 'cozinha', etapa: 'sobremesa', preparo: 4 },
  { id: 'cocada', nome: 'Cocada de forno', preco: 2200, estacao: 'cozinha', etapa: 'sobremesa', preparo: 10 },
  { id: 'pudim', nome: 'Pudim de tapioca', preco: 2100, estacao: 'cozinha', etapa: 'sobremesa', preparo: 4 },
  { id: 'suco-cacau', nome: 'Suco de cacau', preco: 1400, estacao: 'bar', etapa: 'bebida', preparo: 4 },
  { id: 'suco-caja', nome: 'Suco de cajá', preco: 1200, estacao: 'bar', etapa: 'bebida', preparo: 4 },
  { id: 'caipirinha', nome: 'Caipirinha de umbu', preco: 2600, estacao: 'bar', etapa: 'bebida', preparo: 5 },
  { id: 'agua-coco', nome: 'Água de coco', preco: 1000, estacao: 'bar', etapa: 'bebida', preparo: 2 },
];

const porId = new Map(CARDAPIO.map((i) => [i.id, i]));
export const itemDoCardapio = (id: string): ItemDoCardapio | undefined => porId.get(id);
