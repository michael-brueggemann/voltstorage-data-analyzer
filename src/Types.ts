export interface Log4jWindow extends Window {
  log4javascript: any;
  introJs: any;
}

export interface DataApi {
  getData(productId: string, from: Date, to: Date): Promise<string | null>;
}

export interface Battery {
  productId: string;
  serialNumber: string;
  // color: string;
  online: boolean;
  errors: string[];
}

export interface DataSet {
  dateTime: Date;
  powerFromGrid?: number;
  powerToGrid?: number;
  powerHousehold?: number;
  powerPV?: number;
  battery1To?: number;
  battery1From?: number;
  battery1Soc?: number;
  battery2To?: number;
  battery2From?: number;
  battery2Soc?: number;
}

export interface Stats {
  dateTime: Date;
  powerFromGrid?: number;
  powerToGrid?: number;
  powerHousehold?: number;
  powerPV?: number;
  battery1To?: number;
  battery1From?: number;
  battery1SocMin?: number;
  battery1SocMax?: number;
  battery2To?: number;
  battery2From?: number;
  battery2SocMin?: number;
  battery2SocMax?: number;
  failures?: string;
}

export class Color {
  // start with the dark colors
  public midnightblue = '#191970';
  public blue = '#0000ff';
  public dodgerblue = '#1e90ff';
  public darkgreen = '#006400';
  public olive = '#808000';
  public orangered = '#ff4500';
  public mediumvioletred = '#c71585';
  public lime = '#00ff00';
  public aqua = '#00ffff';
  public gold = '#ffd700';
  public burlywood = '#deb887';
}
