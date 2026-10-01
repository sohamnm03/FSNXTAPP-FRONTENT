import companyLogo from '../../../assets/company-logo.svg';

export default function BrandLogo({ large = false }) {
  return (
    <span aria-hidden="true" className={`brand-logo${large ? ' brand-logo--large' : ''}`}>
      <img src={companyLogo} alt="" />
    </span>
  );
}
