const CODIGO_UF = {
  AC: '12', AL: '27', AP: '16', AM: '13', BA: '29', CE: '23', DF: '53',
  ES: '32', GO: '52', MA: '21', MT: '51', MS: '50', MG: '31', PA: '15',
  PB: '25', PR: '41', PE: '26', PI: '22', RJ: '33', RN: '24', RS: '43',
  RO: '11', RR: '14', SC: '42', SP: '35', SE: '28', TO: '17'
};

const NOME_UF = {
  AC: 'Acre', AL: 'Alagoas', AP: 'Amapa', AM: 'Amazonas', BA: 'Bahia',
  CE: 'Ceara', DF: 'Distrito Federal', ES: 'Espirito Santo', GO: 'Goias',
  MA: 'Maranhao', MT: 'Mato Grosso', MS: 'Mato Grosso do Sul', MG: 'Minas Gerais',
  PA: 'Para', PB: 'Paraiba', PR: 'Parana', PE: 'Pernambuco', PI: 'Piaui',
  RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte', RS: 'Rio Grande do Sul',
  RO: 'Rondonia', RR: 'Roraima', SC: 'Santa Catarina', SP: 'Sao Paulo',
  SE: 'Sergipe', TO: 'Tocantins'
};

const SVRS = {
  homologacao: {
    autorizacao: 'https://nfce-homologacao.svrs.rs.gov.br/ws/NfeAutorizacao/NFeAutorizacao4.asmx',
    retAutorizacao: 'https://nfce-homologacao.svrs.rs.gov.br/ws/NfeRetAutorizacao/NFeRetAutorizacao4.asmx',
    consulta: 'https://nfce-homologacao.svrs.rs.gov.br/ws/NfeConsulta/NFeConsulta4.asmx',
    evento: 'https://nfce-homologacao.svrs.rs.gov.br/ws/NfeRecepcaoEvento/NFeRecepcaoEvento4.asmx',
    status: 'https://nfce-homologacao.svrs.rs.gov.br/ws/NfeStatusServico/NFeStatusServico4.asmx',
    qr: 'http://www.svrs.rs.gov.br/nfce/qrcode',
    consultaChave: 'http://www.svrs.rs.gov.br/NFCE/NFCE-COM.aspx'
  },
  producao: {
    autorizacao: 'https://nfce.svrs.rs.gov.br/ws/NfeAutorizacao/NFeAutorizacao4.asmx',
    retAutorizacao: 'https://nfce.svrs.rs.gov.br/ws/NfeRetAutorizacao/NFeRetAutorizacao4.asmx',
    consulta: 'https://nfce.svrs.rs.gov.br/ws/NfeConsulta/NFeConsulta4.asmx',
    evento: 'https://nfce.svrs.rs.gov.br/ws/NfeRecepcaoEvento/NFeRecepcaoEvento4.asmx',
    status: 'https://nfce.svrs.rs.gov.br/ws/NfeStatusServico/NFeStatusServico4.asmx',
    qr: 'https://www.sefaz.rs.gov.br/NFCE/NFCE-COM.aspx',
    consultaChave: 'https://www.sefaz.rs.gov.br/NFCE/NFCE-COM.aspx'
  }
};

const ENDPOINTS = {
  SP: {
    homologacao: {
      autorizacao: 'https://homologacao.nfce.fazenda.sp.gov.br/ws/NFeAutorizacao4.asmx',
      evento: 'https://homologacao.nfce.fazenda.sp.gov.br/ws/NFeRecepcaoEvento4.asmx',
      consulta: 'https://homologacao.nfce.fazenda.sp.gov.br/ws/NFeConsultaProtocolo4.asmx',
      status: 'https://homologacao.nfce.fazenda.sp.gov.br/ws/NFeStatusServico4.asmx',
      qr: 'https://www.homologacao.nfce.fazenda.sp.gov.br/qrcode',
      consultaChave: 'https://www.homologacao.nfce.fazenda.sp.gov.br/consulta'
    },
    producao: {
      autorizacao: 'https://nfce.fazenda.sp.gov.br/ws/NFeAutorizacao4.asmx',
      evento: 'https://nfce.fazenda.sp.gov.br/ws/NFeRecepcaoEvento4.asmx',
      consulta: 'https://nfce.fazenda.sp.gov.br/ws/NFeConsultaProtocolo4.asmx',
      status: 'https://nfce.fazenda.sp.gov.br/ws/NFeStatusServico4.asmx',
      qr: 'https://www.nfce.fazenda.sp.gov.br/qrcode',
      consultaChave: 'https://www.nfce.fazenda.sp.gov.br/consulta'
    }
  },
  MG: {
    homologacao: {
      autorizacao: 'https://hnfce.fazenda.mg.gov.br/nfce/services/NFeAutorizacao4',
      evento: 'https://hnfce.fazenda.mg.gov.br/nfce/services/NFeRecepcaoEvento4',
      consulta: 'https://hnfce.fazenda.mg.gov.br/nfce/services/NFeConsultaProtocolo4',
      status: 'https://hnfce.fazenda.mg.gov.br/nfce/services/NFeStatusServico4',
      qr: 'https://portalsped.fazenda.mg.gov.br/portalnfce/sistema/qrcode.xhtml',
      consultaChave: 'https://portalsped.fazenda.mg.gov.br/portalnfce'
    },
    producao: {
      autorizacao: 'https://nfce.fazenda.mg.gov.br/nfce/services/NFeAutorizacao4',
      evento: 'https://nfce.fazenda.mg.gov.br/nfce/services/NFeRecepcaoEvento4',
      consulta: 'https://nfce.fazenda.mg.gov.br/nfce/services/NFeConsultaProtocolo4',
      status: 'https://nfce.fazenda.mg.gov.br/nfce/services/NFeStatusServico4',
      qr: 'https://portalsped.fazenda.mg.gov.br/portalnfce/sistema/qrcode.xhtml',
      consultaChave: 'https://portalsped.fazenda.mg.gov.br/portalnfce'
    }
  },
  PR: {
    homologacao: {
      autorizacao: 'https://homologacao.nfce.sefa.pr.gov.br/nfce/NFeAutorizacao4',
      evento: 'https://homologacao.nfce.sefa.pr.gov.br/nfce/NFeRecepcaoEvento4',
      consulta: 'https://homologacao.nfce.sefa.pr.gov.br/nfce/NFeConsultaProtocolo4',
      status: 'https://homologacao.nfce.sefa.pr.gov.br/nfce/NFeStatusServico4',
      qr: 'http://www.fazenda.pr.gov.br/nfce/qrcode',
      consultaChave: 'http://www.fazenda.pr.gov.br/nfce/consulta'
    },
    producao: {
      autorizacao: 'https://nfce.sefa.pr.gov.br/nfce/NFeAutorizacao4',
      evento: 'https://nfce.sefa.pr.gov.br/nfce/NFeRecepcaoEvento4',
      consulta: 'https://nfce.sefa.pr.gov.br/nfce/NFeConsultaProtocolo4',
      status: 'https://nfce.sefa.pr.gov.br/nfce/NFeStatusServico4',
      qr: 'http://www.fazenda.pr.gov.br/nfce/qrcode',
      consultaChave: 'http://www.fazenda.pr.gov.br/nfce/consulta'
    }
  },
  BA: {
    homologacao: {
      autorizacao: 'https://hnfce.sefaz.ba.gov.br/webservices/NFeAutorizacao4/NFeAutorizacao4.asmx',
      evento: 'https://hnfce.sefaz.ba.gov.br/webservices/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx',
      consulta: 'https://hnfce.sefaz.ba.gov.br/webservices/NFeConsultaProtocolo4/NFeConsultaProtocolo4.asmx',
      status: 'https://hnfce.sefaz.ba.gov.br/webservices/NFeStatusServico4/NFeStatusServico4.asmx',
      qr: 'http://hnfe.sefaz.ba.gov.br/servicos/nfce/qrcode.aspx',
      consultaChave: 'http://hnfe.sefaz.ba.gov.br/servicos/nfce/Consulta.aspx'
    },
    producao: {
      autorizacao: 'https://nfce.sefaz.ba.gov.br/webservices/NFeAutorizacao4/NFeAutorizacao4.asmx',
      evento: 'https://nfce.sefaz.ba.gov.br/webservices/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx',
      consulta: 'https://nfce.sefaz.ba.gov.br/webservices/NFeConsultaProtocolo4/NFeConsultaProtocolo4.asmx',
      status: 'https://nfce.sefaz.ba.gov.br/webservices/NFeStatusServico4/NFeStatusServico4.asmx',
      qr: 'http://nfe.sefaz.ba.gov.br/servicos/nfce/qrcode.aspx',
      consultaChave: 'http://nfe.sefaz.ba.gov.br/servicos/nfce/Consulta.aspx'
    }
  },
  GO: {
    homologacao: {
      autorizacao: 'https://homolog.sefaz.go.gov.br/nfe/services/NFeAutorizacao4',
      evento: 'https://homolog.sefaz.go.gov.br/nfe/services/NFeRecepcaoEvento4',
      consulta: 'https://homolog.sefaz.go.gov.br/nfe/services/NFeConsultaProtocolo4',
      status: 'https://homolog.sefaz.go.gov.br/nfe/services/NFeStatusServico4',
      qr: 'http://nfe.sefaz.go.gov.br/nfeweb/sites/nfce/danfeNFCe',
      consultaChave: 'http://nfe.sefaz.go.gov.br/nfeweb/sites/nfce/danfeNFCe'
    },
    producao: {
      autorizacao: 'https://nfe.sefaz.go.gov.br/nfe/services/NFeAutorizacao4',
      evento: 'https://nfe.sefaz.go.gov.br/nfe/services/NFeRecepcaoEvento4',
      consulta: 'https://nfe.sefaz.go.gov.br/nfe/services/NFeConsultaProtocolo4',
      status: 'https://nfe.sefaz.go.gov.br/nfe/services/NFeStatusServico4',
      qr: 'http://nfe.sefaz.go.gov.br/nfeweb/sites/nfce/danfeNFCe',
      consultaChave: 'http://nfe.sefaz.go.gov.br/nfeweb/sites/nfce/danfeNFCe'
    }
  },
  MT: {
    homologacao: {
      autorizacao: 'https://homologacao.sefaz.mt.gov.br/nfcews/services/NfeAutorizacao4',
      evento: 'https://homologacao.sefaz.mt.gov.br/nfcews/services/RecepcaoEvento4',
      consulta: 'https://homologacao.sefaz.mt.gov.br/nfcews/services/NfeConsulta4',
      status: 'https://homologacao.sefaz.mt.gov.br/nfcews/services/NfeStatusServico4',
      qr: 'http://homologacao.sefaz.mt.gov.br/nfce/consultanfce',
      consultaChave: 'http://homologacao.sefaz.mt.gov.br/nfce/consultanfce'
    },
    producao: {
      autorizacao: 'https://nfce.sefaz.mt.gov.br/nfcews/services/NfeAutorizacao4',
      evento: 'https://nfce.sefaz.mt.gov.br/nfcews/services/RecepcaoEvento4',
      consulta: 'https://nfce.sefaz.mt.gov.br/nfcews/services/NfeConsulta4',
      status: 'https://nfce.sefaz.mt.gov.br/nfcews/services/NfeStatusServico4',
      qr: 'http://www.sefaz.mt.gov.br/nfce/consultanfce',
      consultaChave: 'http://www.sefaz.mt.gov.br/nfce/consultanfce'
    }
  },
  MS: {
    homologacao: {
      autorizacao: 'https://hom.nfce.sefaz.ms.gov.br/ws/NFeAutorizacao4',
      evento: 'https://hom.nfce.sefaz.ms.gov.br/ws/NFeRecepcaoEvento4',
      consulta: 'https://hom.nfce.sefaz.ms.gov.br/ws/NFeConsultaProtocolo4',
      status: 'https://hom.nfce.sefaz.ms.gov.br/ws/NFeStatusServico4',
      qr: 'http://www.dfe.ms.gov.br/nfce/qrcode',
      consultaChave: 'http://www.dfe.ms.gov.br/nfce/consulta'
    },
    producao: {
      autorizacao: 'https://nfce.sefaz.ms.gov.br/ws/NFeAutorizacao4',
      evento: 'https://nfce.sefaz.ms.gov.br/ws/NFeRecepcaoEvento4',
      consulta: 'https://nfce.sefaz.ms.gov.br/ws/NFeConsultaProtocolo4',
      status: 'https://nfce.sefaz.ms.gov.br/ws/NFeStatusServico4',
      qr: 'http://www.dfe.ms.gov.br/nfce/qrcode',
      consultaChave: 'http://www.dfe.ms.gov.br/nfce/consulta'
    }
  },
  PE: {
    homologacao: {
      autorizacao: 'https://nfcehomolog.sefaz.pe.gov.br/nfe-service/services/NFeAutorizacao4',
      evento: 'https://nfcehomolog.sefaz.pe.gov.br/nfe-service/services/NFeRecepcaoEvento4',
      consulta: 'https://nfcehomolog.sefaz.pe.gov.br/nfe-service/services/NFeConsultaProtocolo4',
      status: 'https://nfcehomolog.sefaz.pe.gov.br/nfe-service/services/NFeStatusServico4',
      qr: 'http://nfce.sefaz.pe.gov.br/nfce/consulta',
      consultaChave: 'http://nfce.sefaz.pe.gov.br/nfce/consulta'
    },
    producao: {
      autorizacao: 'https://nfce.sefaz.pe.gov.br/nfe-service/services/NFeAutorizacao4',
      evento: 'https://nfce.sefaz.pe.gov.br/nfe-service/services/NFeRecepcaoEvento4',
      consulta: 'https://nfce.sefaz.pe.gov.br/nfe-service/services/NFeConsultaProtocolo4',
      status: 'https://nfce.sefaz.pe.gov.br/nfe-service/services/NFeStatusServico4',
      qr: 'http://nfce.sefaz.pe.gov.br/nfce/consulta',
      consultaChave: 'http://nfce.sefaz.pe.gov.br/nfce/consulta'
    }
  },
  AM: {
    homologacao: {
      autorizacao: 'https://homnfce.sefaz.am.gov.br/nfce-services/services/NfeAutorizacao4',
      evento: 'https://homnfce.sefaz.am.gov.br/nfce-services/services/RecepcaoEvento4',
      consulta: 'https://homnfce.sefaz.am.gov.br/nfce-services/services/NfeConsulta4',
      status: 'https://homnfce.sefaz.am.gov.br/nfce-services/services/NfeStatusServico4',
      qr: 'http://homnfce.sefaz.am.gov.br/nfceweb/consultarNFCe.jsp',
      consultaChave: 'http://homnfce.sefaz.am.gov.br/nfceweb/consultarNFCe.jsp'
    },
    producao: {
      autorizacao: 'https://nfce.sefaz.am.gov.br/nfce-services/services/NfeAutorizacao4',
      evento: 'https://nfce.sefaz.am.gov.br/nfce-services/services/RecepcaoEvento4',
      consulta: 'https://nfce.sefaz.am.gov.br/nfce-services/services/NfeConsulta4',
      status: 'https://nfce.sefaz.am.gov.br/nfce-services/services/NfeStatusServico4',
      qr: 'http://sistemas.sefaz.am.gov.br/nfceweb/consultarNFCe.jsp',
      consultaChave: 'http://sistemas.sefaz.am.gov.br/nfceweb/consultarNFCe.jsp'
    }
  }
};

function endpoints(uf, ambiente) {
  const amb = ambiente === 'producao' ? 'producao' : 'homologacao';
  const sigla = String(uf || 'RN').toUpperCase();
  if (ENDPOINTS[sigla]) return ENDPOINTS[sigla][amb];
  return SVRS[amb];
}

module.exports = { CODIGO_UF, NOME_UF, endpoints };
