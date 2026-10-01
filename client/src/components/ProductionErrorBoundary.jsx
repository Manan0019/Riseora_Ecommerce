import React from "react";

export default class ProductionErrorBoundary extends React.Component {
  state = {hasError:false};

  static getDerivedStateFromError(){
    return {hasError:true};
  }

  render(){
    if(this.state.hasError){
      return <div>Something went wrong.</div>;
    }

    return this.props.children;
  }
}